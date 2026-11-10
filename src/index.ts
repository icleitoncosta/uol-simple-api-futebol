import axios from 'axios';
import process from 'node:process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Match } from './types/api';
import { semGloboplay } from './esportes/tipos';
import { getUOLData } from './uol';
import { getFutebolNaTVData } from './futebolnatv';
import { getFolhaData } from './folha';
import { getPapoDeBolaData } from './papodebola';
import { getMantosDoFutebolData } from './mantosdofutebol';
import { getGoalData } from './goal';
import { teamsMatchName, toBrazilianTeamDisplayName, formatCampeonatoName } from './team-name-match';
import {
  formatBrazilDateDDMMYYYY,
  formatBrazilHora,
  getBrazilTodayDDMMYYYY,
  addDaysToBrazilDate,
} from './brazil-time';
import { isFemininoFromApiFixture, isSub20FromApiFixture } from './match-flags';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Busca e retorna a lista de jogos de futebol do dia especificado.
 * Combina dados da API esportiva com canais do UOL e Futebol na TV.
 *
 * @async
 * @param {string} [dia] - Data no formato 'dd-mm-aaaa'. Se não for fornecida, utiliza a data atual.
 * @returns {Promise<Array<Match>>}
 *          Retorna uma Promise que resolve para um array de objetos contendo informações dos jogos:
 *          - campeonato: Nome do campeonato
 *          - estadio: Nome do estádio
 *          - hora: Horário do jogo (ex: "21h30")
 *          - times: Array com as siglas dos times
 *          - nomeTimes: Array com os nomes completos dos times
 *          - idFootballApiTimes: Array com os ids dos times na api-sports.io
 *          - canais: Array com os canais de transmissão
 *          - escudos: Array com URLs dos escudos dos times
 *          - date: Data/hora do jogo como objeto Date
 * @throws {Error} Caso ocorra algum erro na requisição ou no processamento dos dados.
 */

function getDataAtualFormatada() {
  return getBrazilTodayDDMMYYYY();
}

export function parseDataHoraBR(dataStr: string, horaStr: string): Date {
  const [dia, mes, ano] = dataStr.split("-").map(Number);

  const horaMatch = horaStr.match(/^(\d{1,2})h(\d{1,2})?$/i);
  if (!horaMatch) {
    throw new Error("Formato de hora inválido. Use ex: 21h30, 19h, 15h");
  }

  const horas = parseInt(horaMatch[1], 10);
  const minutos = horaMatch[2] ? parseInt(horaMatch[2], 10) : 0;

  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:00-03:00`;
  return new Date(iso);
}

function ordenarPorData(jogos: Match[]): Match[] {
  return jogos.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Caminho do arquivo de cache
const CACHE_FILE_PATH = join(process.cwd(), 'cache', 'jogos-cache.json');

function carregarCache(): Record<string, Match[]> {
  try {
    if (!existsSync(CACHE_FILE_PATH)) {
      return {};
    }
    const fileContent = readFileSync(CACHE_FILE_PATH, 'utf-8');
    return JSON.parse(fileContent);
  } catch (err) {
    return {};
  }
}

function salvarCache(cache: Record<string, Match[]>): void {
  try {
    // Criar diretório cache se não existir
    const cacheDir = join(process.cwd(), 'cache');
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    
    writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Erro ao salvar cache:', err);
  }
}

/**
 * Formata data para a API (YYYY-MM-DD)
 */
function formatarDataParaAPI(dataStr: string): string {
  const [dia, mes, ano] = dataStr.split("-").map(Number);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Busca jogos da API esportiva (api-sports.io)
 */
async function buscarJogosAPI(dataAPI: string): Promise<any[]> {
  const url = `https://v3.football.api-sports.io/fixtures`;
  const apiKey = process.env.FOOTBALL_API_KEY;
  
  if (!apiKey) {
    throw new Error('FOOTBALL_API_KEY não está definida. Crie um arquivo .env na raiz do projeto com: FOOTBALL_API_KEY=sua_chave_aqui');
  }
  
  const response = await axios.get(url, {
    params: {
      date: dataAPI,
      timezone: 'America/Sao_Paulo'
    },
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'v3.football.api-sports.io'
    },
    timeout: 30000
  });
  
  // A API responde 200 com { errors: {...}, response: [] } quando o plano não cobre a data.
  // Isso não é "dia sem jogos": não pode ir para o cache.
  const erros = response.data?.errors;
  if (erros && Object.keys(erros).length > 0) {
    const err: any = new Error(`API esportiva: ${JSON.stringify(erros)}`);
    err.planoBloqueado = Boolean(erros.plan);
    throw err;
  }

  // A API retorna { response: [...] }
  return response.data?.response || [];
}


function deveIncluirJogo(fixtureData: any): boolean {
  const league = fixtureData.league || {};
  
  // Filtrar por:
  // - league.country = "Brazil" OU
  // - league.id = 18 (Brasileirão Série A) OU
  // - league.id = 4 (UEFA Champions League)
  
  const isBrazilLeague = league.country === 'Brazil';
  const isSerieA = league.id === 71; // Brasileirão Série A n
  const isSerieB = league.id === 72; // Brasileirão Série B 
  const isChampionsLeague = league.id === 2; // UEFA Champions League
  const isChampionsLeagueWomen = league.id === 525; // UEFA Champions League Women
  const isLaLiga = league.id === 140; // LA Liga
  const isLeagueOne = league.id === 61; // League One
  const isLeague2England = league.id === 40; // League Two England
  const isEnglandLeagueWomen = league.id === 44; // England League Women
  const isNorthIrelandLeague = league.id === 408; // North Ireland League
  const isIntercontinentalCup = league.id === 1168; // Intercontinental Cup
  const isUEFAEuropaLeague = league.id === 3; // UEFA Europa League
  const isEnglandCup = league.id === 48; // Copa da Liga Inglesa
  const isKingCupSpain = league.id === 143; // Copa do Rei da Espanha
  const isSuperCupItaly = league.id === 547; // Super Copa da Itália
  const isUEFACup = league.id === 848; // UEFA Conference League
  const isInternationalFriendly = league.id === 10; // Amistoso Internacional
  
  return isBrazilLeague || isSerieA || isChampionsLeague || isSerieB || isChampionsLeagueWomen || 
         isLaLiga || isLeagueOne || isLeague2England || isNorthIrelandLeague || isIntercontinentalCup || 
         isEnglandLeagueWomen || isUEFAEuropaLeague || isEnglandCup || isKingCupSpain || isSuperCupItaly ||
         isUEFACup || isInternationalFriendly;
}

/**
 * Verifica se um jogo acontece na data especificada (horário brasileiro)
 */
function aconteceNaData(fixtureData: any, diaFormatado: string): boolean {
  try {
    const fixture = fixtureData.fixture || {};
    const dateStr = fixture.date;

    if (!dateStr) {
      return false;
    }

    return formatBrazilDateDDMMYYYY(new Date(dateStr)) === diaFormatado;
  } catch (err) {
    return false;
  }
}

/**
 * Converte dados da API esportiva para o formato Match
 */
function converterAPIParaMatch(fixtureData: any, diaFormatado: string): Match | null {
  try {
    const fixture = fixtureData.fixture || {};
    const teams = fixtureData.teams || {};
    const league = fixtureData.league || {};
    const venue = fixtureData.fixture?.venue || {};
    
    if (!teams.home?.name || !teams.away?.name) {
      return null;
    }

    // A data já está em timezone America/Sao_Paulo
    const dateStr = fixture.date;
    if (!dateStr) {
      return null;
    }

    const fixtureDate = new Date(dateStr);
    const horaBR = formatBrazilHora(fixtureDate);
    const dataBRFormatada = formatBrazilDateDDMMYYYY(fixtureDate);

    const nomeHomePt = toBrazilianTeamDisplayName(teams.home.name);
    const nomeAwayPt = toBrazilianTeamDisplayName(teams.away.name);
    const siglaHome = nomeHomePt.replace(/\s+/g, '').substring(0, 3).toUpperCase();
    const siglaAway = nomeAwayPt.replace(/\s+/g, '').substring(0, 3).toUpperCase();

    return {
      campeonato: formatCampeonatoName(league.name || 'Campeonato não informado', league.id),
      logoCampeonato: league.logo || null,
      estadio: venue.name || 'Não informado',
      hora: horaBR,
      times: [siglaHome, siglaAway],
      nomeTimes: [nomeHomePt, nomeAwayPt],
      idFootballApiTimes: [teams.home.id, teams.away.id],
      canais: [], // Será preenchido depois
      escudos: [
        teams.home.logo || '',
        teams.away.logo || ''
      ],
      date: parseDataHoraBR(dataBRFormatada, horaBR),
      destaque: false,
      sub20: isSub20FromApiFixture(fixtureData),
      feminino: isFemininoFromApiFixture(fixtureData),
    };
  } catch (err) {
    console.warn('Erro ao converter fixture para Match:', err);
    return null;
  }
}

/**
 * Busca canais para um jogo específico a partir de listas pré-buscadas
 * Compara por nome dos times E horário
 */
function horariosCombinam(horaA: string, horaB: string): boolean {
  const normalizarHora = (hora: string) => hora.replace(/\s+/g, '').toLowerCase();
  const hA = normalizarHora(horaA);
  const hB = normalizarHora(horaB);
  return (
    hA === hB ||
    Math.abs(parseInt(hA.replace('h', ''), 10) - parseInt(hB.replace('h', ''), 10)) <= 1
  );
}

function jogoTVCombinaComFixture(jogo: Match, jogoTV: Match, horaFixture: string): boolean {
  if (!jogoTV.nomeTimes || !Array.isArray(jogoTV.nomeTimes) || jogoTV.nomeTimes.length < 2) {
    return false;
  }
  // o nome da TV passa pela mesma normalização do da API (ex.: "Paris Saint-Germain" = PSG)
  const homeTV = normalizeTimeName(String(jogoTV.nomeTimes[0] || ''));
  const awayTV = normalizeTimeName(String(jogoTV.nomeTimes[1] || ''));
  if (!homeTV || !awayTV) {
    return false;
  }
  const homeApi = normalizeTimeName(jogo.nomeTimes[0]);
  const awayApi = normalizeTimeName(jogo.nomeTimes[1]);
  return (
    teamsMatchName(homeApi, homeTV) &&
    teamsMatchName(awayApi, awayTV) &&
    horariosCombinam(horaFixture, jogoTV.hora)
  );
}

function buscarCanaisParaJogo(jogo: Match, jogosUOL: Match[], jogosFutebolNaTV: Match[]): string[] {
  const canais: Set<string> = new Set();

  const adicionarCanais = (fonte: Match) => {
    prepareChannelName(fonte.canais).forEach((canal) => canais.add(canal));
  };

  for (const jogoUOL of jogosUOL) {
    if (jogoTVCombinaComFixture(jogo, jogoUOL, jogo.hora)) {
      adicionarCanais(jogoUOL);
    }
  }

  for (const jogoFTV of jogosFutebolNaTV) {
    if (jogoTVCombinaComFixture(jogo, jogoFTV, jogo.hora)) {
      adicionarCanais(jogoFTV);
    }
  }

  return semGloboplay(Array.from(canais));
}

function buscarDestaqueParaJogo(jogo: Match, jogosUOL: Match[]): boolean {
  for (const jogoUOL of jogosUOL) {
    if (jogoTVCombinaComFixture(jogo, jogoUOL, jogo.hora) && jogoUOL.destaque) {
      return true;
    }
  }
  return false;
}

/**
 * Lista de jogos vinda só das fontes de TV (data que a API esportiva não cobre).
 * Sem escudo, estádio nem ids da API; o mesmo jogo em várias fontes vira um só, com os canais somados.
 */
async function jogosSomenteTV(diaFormatado: string): Promise<Match[]> {
  const hoje = getBrazilTodayDDMMYYYY();
  // Futebol na TV só tem ontem, hoje e amanhã (qualquer outra data devolve a página de hoje)
  const ftvCobre = [-1, 0, 1].some((n) => addDaysToBrazilDate(hoje, n) === diaFormatado);
  const dataApi = diaFormatado.split('-').reverse().join('-');
  const fontes = await Promise.all([
    getUOLData(diaFormatado, dataApi).catch(() => [] as Match[]),
    ftvCobre ? getFutebolNaTVData(diaFormatado).catch(() => [] as Match[]) : Promise.resolve([] as Match[]),
    getFolhaData(diaFormatado).catch(() => [] as Match[]),
    getPapoDeBolaData(diaFormatado).catch(() => [] as Match[]),
    getMantosDoFutebolData(diaFormatado).catch(() => [] as Match[]),
    getGoalData(diaFormatado).catch(() => [] as Match[]),
  ]);

  const unicos: Match[] = [];
  for (const jogo of fontes.flat()) {
    const igual = unicos.find(
      (u) =>
        teamsMatchName(normalizeTimeName(u.nomeTimes[0]), normalizeTimeName(jogo.nomeTimes[0])) &&
        teamsMatchName(normalizeTimeName(u.nomeTimes[1]), normalizeTimeName(jogo.nomeTimes[1])) &&
        horariosCombinam(u.hora, jogo.hora)
    );
    if (igual) {
      igual.canais = Array.from(new Set([...igual.canais, ...jogo.canais]));
      igual.destaque = igual.destaque || jogo.destaque;
    } else {
      unicos.push({ ...jogo, canais: [...jogo.canais] });
    }
  }
  for (const jogo of unicos) jogo.canais = semGloboplay(prepareChannelName(jogo.canais));
  return ordenarPorData(unicos.filter((j) => j.canais.length > 0));
}

export default async function getJogos(dia: string | null = null): Promise<Match[]> {
  if (typeof dia !== 'string' || !/^\d{2}-\d{2}-\d{4}$/.test(dia) && dia !== null) {
    console.warn("Data inválida. Usando data atual.");
    dia = getDataAtualFormatada();
  }
  
  const diaFormatado = dia ?? getDataAtualFormatada();
  
  // Carregar cache do arquivo
  const cache = carregarCache();
  
  // Verificar se existe cache para esta data
  if (cache[diaFormatado] && process.env.DISABLE_CACHE !== 'true') {
    console.log(`Retornando jogos do cache para ${diaFormatado}...`);
    return cache[diaFormatado].map((jogo) => ({
      ...jogo,
      idFootballApiTimes: jogo.idFootballApiTimes ?? [],
      destaque: Boolean(jogo.destaque),
      sub20: Boolean(jogo.sub20),
      feminino: Boolean(jogo.feminino),
    }));
  }
  
  console.log(`Buscando jogos para ${diaFormatado}...`);
  
  // 1. Buscar jogos da API esportiva primeiro
  let fixtures: any[] = [];
  try {
    const dataAPI = formatarDataParaAPI(diaFormatado);
    fixtures = await buscarJogosAPI(dataAPI);
  } catch (err: any) {
    console.warn('Erro ao buscar jogos da API esportiva:', err.message);
    // Em caso de erro, não salvar no cache para permitir nova tentativa
    // Data fora do plano da API (hoje só D-1 a D+1): monta a lista só com as fontes de TV, sem cache,
    // para o dia ser refeito com a API esportiva assim que ela passar a cobrir.
    if (err.planoBloqueado) return jogosSomenteTV(diaFormatado);
    return [];
  }
  
  if (fixtures.length === 0) {
    // Salvar array vazio no cache para evitar requisições futuras
    cache[diaFormatado] = [];
    salvarCache(cache);
    console.log(`Nenhum jogo encontrado para ${diaFormatado}, cache atualizado`);
    return [];
  }
  
  // 2. Filtrar jogos pelo horário brasileiro (que acontecem na data especificada)
  const fixturesNaData = fixtures.filter(fixture => aconteceNaData(fixture, diaFormatado));
  console.log(`Jogos que acontecem em ${diaFormatado}: ${fixturesNaData.length}`);
  
  // 3. Filtrar por país/liga: Brazil OU league_id 18 OU league_id 4
  //const fixturesFiltrados = fixturesNaData.filter(fixture => deveIncluirJogo(fixture)); // Removido verificação dos jogos para colocar qualquer jogo que passe no dia independente de ser relevante ou nao na TV
  const fixturesFiltrados = fixturesNaData;
  
  if (fixturesFiltrados.length === 0) {
    // Salvar array vazio no cache para evitar requisições futuras
    cache[diaFormatado] = [];
    salvarCache(cache);
    console.log(`Nenhum jogo filtrado para ${diaFormatado}, cache atualizado`);
    return [];
  }
  
  // 4. Buscar canais do UOL e Futebol na TV (paralelo)
  const [d, m, y] = diaFormatado.split('-');
  const dataApi = `${y}-${m}-${d}`;
  
  let jogosUOL: Match[] = [];
  let jogosFutebolNaTV: Match[] = [];
  
  try {
    jogosUOL = await getUOLData(diaFormatado, dataApi);
    console.log(`Encontrados ${jogosUOL.length} jogos no UOL`);
  } catch (err: any) {
    console.warn('Erro ao buscar jogos do UOL, continuando sem eles:', err.message);
    jogosUOL = [];
  }
  
  // Folha: só traz jogos se a página for do dia pedido (ver tituloEhDoDia).
  let jogosFolha: Match[] = [];
  // Goal: guia com hoje e os próximos dias (só entra a tabela da data pedida).
  let jogosGoal: Match[] = [];
  try {
    jogosGoal = await getGoalData(diaFormatado);
    console.log(`Encontrados ${jogosGoal.length} jogos na Goal`);
  } catch (err: any) {
    console.warn('Erro ao buscar jogos da Goal, continuando sem eles:', err.message);
  }

  // Mantos do Futebol: hoje, amanhã e depois (só entra seção com a data pedida).
  let jogosMantos: Match[] = [];
  try {
    jogosMantos = await getMantosDoFutebolData(diaFormatado);
    console.log(`Encontrados ${jogosMantos.length} jogos no Mantos do Futebol`);
  } catch (err: any) {
    console.warn('Erro ao buscar jogos do Mantos do Futebol, continuando sem eles:', err.message);
  }

  // Papo de Bola: hoje até +6 dias, canais na página de cada jogo.
  let jogosPapo: Match[] = [];
  try {
    jogosPapo = await getPapoDeBolaData(diaFormatado);
    console.log(`Encontrados ${jogosPapo.length} jogos no Papo de Bola`);
  } catch (err: any) {
    console.warn('Erro ao buscar jogos do Papo de Bola, continuando sem eles:', err.message);
  }

  try {
    jogosFolha = await getFolhaData(diaFormatado);
    console.log(`Encontrados ${jogosFolha.length} jogos na Folha`);
  } catch (err: any) {
    console.warn('Erro ao buscar jogos da Folha, continuando sem eles:', err.message);
  }

  try {
    jogosFutebolNaTV = await getFutebolNaTVData(diaFormatado);
    console.log(`Encontrados ${jogosFutebolNaTV.length} jogos no Futebol na TV`);
  } catch (err: any) {
    console.warn('Erro ao buscar jogos do Futebol na TV, continuando sem eles:', err.message);
    jogosFutebolNaTV = [];
  }
  
  // 5. Converter fixtures filtrados para Match e buscar canais
  const jogos: Match[] = [];
  for (const fixture of fixturesFiltrados) {
    try {
      const jogo = converterAPIParaMatch(fixture, diaFormatado);
      if (jogo) {
        // Buscar canais nas listas pré-buscadas (baseado em nome dos times e horário)
        const canais = buscarCanaisParaJogo(jogo, jogosUOL, [...jogosFutebolNaTV, ...jogosFolha, ...jogosPapo, ...jogosMantos, ...jogosGoal]);
        
        // Filtrar apenas canais Premiere: se tiver Premiere com número, remover Premiere sem número
        const hasPremiereWithNumber = canais.some(c => /^Premiere\s+\d+$/i.test(c));
        let allCanais = canais;
        if (hasPremiereWithNumber) {
          // Filtrar apenas os Premiere: remover "Premiere" sem número, manter os com número e todos os outros canais
          allCanais = canais.filter(c => {
            // Se for Premiere sem número, remover
            if (/^Premiere\s*$/i.test(c)) {
              return false;
            }
            // Manter todos os outros (Premiere com número e demais canais)
            return true;
          });
        }
        jogo.canais = allCanais;
        jogo.destaque = buscarDestaqueParaJogo(jogo, jogosUOL);
        
        // Apenas adicionar se tiver canais (seguindo padrão do UOL)
        if (allCanais.length > 0) {
          jogos.push(jogo);
        }
      }
    } catch (err) {
      console.warn('Erro ao processar fixture, pulando:', err);
    }
  }
  
  console.log(`Total de jogos com transmissão: ${jogos.length}`);
  
  const jogosOrdenados = ordenarPorData(jogos);
  
  // Salvar no cache antes de retornar
  cache[diaFormatado] = jogosOrdenados;
  salvarCache(cache);
  console.log(`Cache atualizado para ${diaFormatado}`);
  
  return jogosOrdenados;
}
function removeAcentos(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function prepareChannelName(channels: string[]): string[] {
  let processed: string[] = [];
  
  channels.forEach(channel => {
    if (!channel || typeof channel !== 'string') {
      return;
    }
    
    let processedChannel = channel.trim();
    const upperChannel = processedChannel.toUpperCase();
    
    // 1. Tratar GLOBO com estados: "GLOBO SP, MS, BA SP, MS, BA" -> ["Globo SP", "Globo MS", "Globo BA"]
    if (upperChannel.includes('GLOBO') && processedChannel.includes(',')) {
      // Extrair estados (siglas de 2 letras maiúsculas)
      const estadosMatch = processedChannel.match(/\b([A-Z]{2})\b/g);
      if (estadosMatch && estadosMatch.length > 0) {
        const estadosUnicos = [...new Set(estadosMatch)];
        estadosUnicos.forEach(estado => {
          processed.push(`Globo ${estado}`);
        });
        return; // Já processou, não adicionar o original
      }
    }
    
    // 2. PREMIERE FC -> Premiere
    if (upperChannel === 'PREMIERE FC') {
      processed.push('Premiere');
      return;
    }
    if (upperChannel === 'CAZÉ TV') {
      processed.push('CazéTV');
      return;
    }
    if (upperChannel === 'CAZÉTV') {
      processed.push('CazéTV');
      return;
    }
    if (upperChannel === 'RECORD') {
      processed.push('Record');
      return;
    }
    
    // 3. DISNEY+ PREMIUM -> Disney+
    if (upperChannel.includes('DISNEY+ PREMIUM')) {
      processed.push('Disney+');
      return;
    }
    
    // 4. DISNEY+ -> Disney+ (primeira letra maiúscula)
    if (upperChannel.includes('DISNEY+')) {
      processed.push('Disney+');
      return;
    }
    
    // 5. PREMIERE (qualquer variação) -> Premiere (primeira letra maiúscula)
    if (upperChannel.includes('PREMIERE')) {
      const premiere = processedChannel.replace('PREMIERE', 'Premiere');
      processed.push(premiere);
      return;
    }
    
    // 6. SPORTV -> SporTV (primeira letra maiúscula)
    if (upperChannel.includes('SPORTV')) {
      processed.push('SporTV');
      return;
    }
    
    // 7. GLOBO (sem estados, só a palavra) -> Globo (primeira letra maiúscula)
    if (upperChannel === 'GLOBO') {
      processed.push('Globo');
      return;
    }
    if (upperChannel === 'HBO MAX') {
      processed.push('HBO Max');
      return;
    }
    
    if (upperChannel === 'SPACE') {
      processed.push('Space');
      return;
    }
    
    if (upperChannel === 'XSPORTS') {
      processed.push('XSports');
      return;
    }
    
    if (upperChannel === 'GE TV') {
      processed.push('GE TV');
      return;
    }
    
    if (upperChannel === 'ESPN BRASIL') {
      processed.push('ESPN');
      return;
    }
    
    if (upperChannel === 'PRIME VIDEO') {
      processed.push('Prime Video');
      return;
    }
    
    if (upperChannel === 'AMAZON PRIME') {
      processed.push('Prime Video');
      return;
    }
    
    if (upperChannel === 'SPORTYNET' || upperChannel === 'YOUTUBE SPORTYNET SPORTYNET') {
      processed.push('SportyNet');
      return;
    }
    
    if (upperChannel === 'SPORTYNET' || upperChannel === 'YOUTUBE SPORTYNET SPORTYNET') {
      processed.push('SportyNet');
      return;
    }
    
    if (upperChannel === 'NSSPORTS' || upperChannel === 'NSPORTS') {
      processed.push('NSports');
      return;
    }
    
    if (upperChannel === 'GLOBO SBT NSSPORTS' || upperChannel === 'GLOBO SBT NSPORTS') {
      processed.push('Globo');
      processed.push('SBT');
      processed.push('NSports');
      return;
    }
    
    if (upperChannel === 'METROPOLES' || upperChannel === 'METRÓPOLES') {
      processed.push('Metrópoles');
      return;
    }
    
    if (upperChannel === 'PAULISTÃO' || upperChannel === 'PAULISTAO') {
      processed.push('Paulistão');
      return;
    }

    // Esses canais que são do Youtube, não são relevantes, removemos eles da lista
    if(upperChannel === 'ENERGIA 97 FM' || upperChannel === 'ULISSES TV') {
      return;
    }
    processed.push(processedChannel);
  });
  
  // Remover duplicatas
  return [...new Set(processed)];
}

function normalizeTimeName(nome: string) {
  return nome.replace(' W', ' (F)')
  .replace(/Paris Saint[ -]Germain/gi, 'PSG') // a API escreve sem hífen, a Folha com hífen
  .replace('Slavia Praha VFL', 'Slavia Praha')
  .replace('Slavia Praha Vfl', 'Slavia Praha')
  .replace('Galatasaray VFL', 'Galatasaray')
  .replace('Galatasaray Vfl', 'Galatasaray')
  .replace('Birmingham VFL', 'Galatasaray')
  .replace('Birmingham Vfl', 'Birmingham')
  .replace(' U20', ' Sub-20')
  .replace(/Am[eé]rica Mineiro/gi, 'América-MG')
  .split('')
  .map(char => {
    // Manter traços, hífens e underlines
    if (char === '-' || char === '_' || char === '–' || char === '—') {
      return char;
    }
    // Remover acentos usando normalize
    return char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  })
  .join('');
}
// Outros esportes e tabelas de classificação.
export * from "./esportes";
