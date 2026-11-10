import * as cheerio from "cheerio";
import { Match } from "./types/api";
import { parseDataHoraBR } from ".";
import { addDaysToBrazilDate, getBrazilTodayDDMMYYYY } from "./brazil-time";
import { isFemininoFromMatchInfo, isSub20FromMatchInfo } from "./match-flags";
import { DIAS_SEMANA, diaDaSemana, semAcento } from "./folha";

// Hoje e "amanhã" são páginas fixas; a de amanhã costuma trazer também o dia seguinte a ele.
const PAGINAS = [
  "https://mantosdofutebol.com.br/guia-de-jogos-tv-hoje-ao-vivo/",
  "https://mantosdofutebol.com.br/jogos-de-amanha-tv/",
];
const DIAS_A_FRENTE = 2;

const HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "pt-BR,pt;q=0.9",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
};

const normalizeText = (t: string) => t.replace(/\s+/g, " ").trim();

// Canais de YouTube vêm como "Youtube.com/@handle". Nomes que o resto da lib já conhece.
const YOUTUBE_CONHECIDOS: Record<string, string> = {
  espnbrasil: "ESPN BRASIL",
  metropolesesportes: "Metrópoles",
  ulissescostatv: "ULISSES TV",
  canalgoatbr: "Canal GOAT",
};

/** "Terça – 10/11" só vale se dia/mês E dia da semana baterem com a data pedida (a página pode estar desatualizada). */
export function tituloEhDoDia(titulo: string, diaFormatado: string): boolean {
  const m = semAcento(normalizeText(titulo)).match(/^([a-z]+)(?:-feira)?\s*[–-]\s*(\d{1,2})\/(\d{1,2})/);
  if (!m) return false;
  const [d, mes] = diaFormatado.split("-").map(Number);
  return Number(m[2]) === d && Number(m[3]) === mes && m[1] === DIAS_SEMANA[diaDaSemana(diaFormatado)];
}

const ehTituloDeDia = (t: string) => /^(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(-feira)?\s*[–-]\s*\d{1,2}\/\d{1,2}/i.test(normalizeText(t));

/** "14h45 – Time A x Time B – Campeonato" */
export function parseTitulo(texto: string): { hora: string; times: [string, string]; campeonato: string } | null {
  const partes = normalizeText(texto).split(/\s+[–-]\s+/);
  if (partes.length < 3) return null;
  const h = partes[0].match(/^(\d{1,2})h(\d{2})?$/i);
  const times = partes[1].split(/\s+x\s+/i).map(normalizeText);
  if (!h || times.length !== 2 || !times[0] || !times[1]) return null;
  return { hora: `${h[1].padStart(2, "0")}h${h[2] || "00"}`, times: [times[0], times[1]], campeonato: partes.slice(2).join(" - ") };
}

/** "Canais: ESPN 4 e Disney+" */
export function parseCanais(texto: string): string[] {
  const t = normalizeText(texto).replace(/^canais?:\s*/i, "");
  if (!t) return [];
  const canais = t
    .split(/\s*,\s*|\s+e\s+/i)
    .map(normalizeText)
    .filter(Boolean)
    .map((c) => {
      const yt = c.match(/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/@?([\w.-]+)/i);
      if (!yt) return c;
      return YOUTUBE_CONHECIDOS[yt[1].toLowerCase()] ?? yt[1];
    });
  return Array.from(new Set(canais));
}

export function parseMantosHTML(html: string, diaFormatado: string): Match[] {
  const $ = cheerio.load(html);
  const games: Match[] = [];
  let secaoDoDia = false;

  // Em ordem de documento: cada h2 de data abre uma seção; os h3 seguintes são os jogos dela.
  $("h2, h3").each((_, el) => {
    const $el = $(el);
    const texto = $el.text();
    if (el.tagName.toLowerCase() === "h2") {
      secaoDoDia = ehTituloDeDia(texto) && tituloEhDoDia(texto, diaFormatado);
      return;
    }
    if (!secaoDoDia) return;
    const info = parseTitulo(texto);
    const canais = parseCanais($el.next("p").text());
    if (!info || canais.length === 0) return;
    const nomeTimes = [info.times[0], info.times[1]];
    games.push({
      campeonato: info.campeonato,
      logoCampeonato: null,
      estadio: "Não informado",
      hora: info.hora,
      times: [nomeTimes[0].substring(0, 3).toUpperCase(), nomeTimes[1].substring(0, 3).toUpperCase()],
      nomeTimes,
      idFootballApiTimes: [],
      canais,
      escudos: ["", ""],
      date: parseDataHoraBR(diaFormatado, info.hora),
      destaque: false,
      sub20: isSub20FromMatchInfo(info.campeonato, nomeTimes),
      feminino: isFemininoFromMatchInfo(info.campeonato, nomeTimes),
    });
  });

  return games;
}

function dentroDaJanela(diaFormatado: string): boolean {
  const hoje = getBrazilTodayDDMMYYYY();
  for (let i = 0; i <= DIAS_A_FRENTE; i++) if (addDaysToBrazilDate(hoje, i) === diaFormatado) return true;
  return false;
}

export async function getMantosDoFutebolData(diaFormatado: string): Promise<Match[]> {
  if (!dentroDaJanela(diaFormatado)) return [];

  const paginas = await Promise.all(
    PAGINAS.map(async (url) => {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        return parseMantosHTML(await r.text(), diaFormatado);
      } catch (err: any) {
        console.error("Erro ao buscar jogos do Mantos do Futebol:", url, err.message);
        return [] as Match[];
      }
    })
  );
  return paginas.flat();
}
