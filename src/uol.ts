import axios from "axios";
import { UOLMatch, UOLTeam } from "./types/uol";
import { parseDataHoraBR, prepareCacheMatchs } from ".";
import { Match } from "./types/api";

export async function getUOLData(diaFormatado: any, dataApi: any): Promise<Match[]> {
      // URL da página do UOL
  const url = `https://www.uol.com.br/esporte/futebol/central-de-jogos/`;

  try{
    await prepareCacheMatchs(url);
  } catch (e) { }
  
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

    return games;
    } catch (err: any) {
        throw new Error('Erro ao buscar os jogos: ' + err.message);
    }
}


function getEscudoUrl(teamSlug: string, size: string = '60x60'): string {
    return `https://e.imguol.com/futebol/brasoes/${size}/${teamSlug}.png`;
}