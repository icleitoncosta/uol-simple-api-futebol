import * as cheerio from "cheerio";
import { Match } from "./types/api";
import { parseDataHoraBR } from ".";
import { addDaysToBrazilDate, getBrazilTodayDDMMYYYY } from "./brazil-time";
import { isFemininoFromMatchInfo, isSub20FromMatchInfo } from "./match-flags";
import { semAcento } from "./folha";

// O "blt..." é o UID da entrada no CMS da Goal (Contentstack), não é gerado a cada acesso: o slug é ignorado
// e só o id identifica a página. A Goal reaproveita a mesma entrada todo dia e troca o conteúdo
// (confirmado: o mesmo id aparece com a data de março/2026 e de novembro/2026).
// Se um dia criarem outra entrada, é só trocar aqui ou definir GOAL_GUIA_URL, sem mexer no código.
const URL_PADRAO =
  "https://www.goal.com/br/listas/futebol-programacao-jogos-tv-aberta-fechada-onde-assistir-online-app/bltc0a7361374657315";
// A página traz hoje e mais 3 dias.
const DIAS_A_FRENTE = 6;

const HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "pt-BR,pt;q=0.9",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
};

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const normalizeText = (t: string) => t.replace(/\s+/g, " ").trim();

/** "Jogos de terça, 10 de novembro de 2026" -> "10-11-2026" (null se não for esse formato). */
export function tituloParaData(titulo: string): string | null {
  const m = semAcento(normalizeText(titulo)).match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!m) return null;
  const mes = MESES.indexOf(m[2]);
  if (mes < 0) return null;
  return `${m[1].padStart(2, "0")}-${String(mes + 1).padStart(2, "0")}-${m[3]}`;
}

/** "14h45" ou "15h" -> "14h45" / "15h00" */
export function parseHora(texto: string): string | null {
  const m = normalizeText(texto).match(/^(\d{1,2})h(\d{2})?$/i);
  return m ? `${m[1].padStart(2, "0")}h${m[2] || "00"}` : null;
}

/** "ESPN Brasil (YouTube) e Disney+" -> ["ESPN Brasil", "Disney+"] */
export function parseCanais(texto: string): string[] {
  const canais = normalizeText(texto)
    .split(/\s*,\s*|\s+e\s+/i)
    .map((c) => normalizeText(c.replace(/\(.*?\)/g, "")))
    .filter(Boolean);
  return Array.from(new Set(canais));
}

export function parseGoalHTML(html: string, diaFormatado: string): Match[] {
  const $ = cheerio.load(html);
  const games: Match[] = [];

  $("h2").each((_, h2) => {
    // cada dia é um h2 com a data completa (com ano) seguido da tabela do dia
    if (tituloParaData($(h2).text()) !== diaFormatado) return;
    const corpo = $(h2).nextAll("div").first();

    corpo.find("tbody tr").each((__, tr) => {
      const td = $(tr).find("td").map((___, c) => normalizeText($(c).text())).get();
      if (td.length < 4) return;
      const times = td[0].split(/\s+x\s+/i).map(normalizeText);
      const hora = parseHora(td[2]);
      const canais = parseCanais(td[3]);
      if (times.length !== 2 || !times[0] || !times[1] || !hora || canais.length === 0) return;
      const nomeTimes = [times[0], times[1]];
      games.push({
        campeonato: td[1] || "Campeonato não informado",
        logoCampeonato: null,
        estadio: "Não informado",
        hora,
        times: [nomeTimes[0].substring(0, 3).toUpperCase(), nomeTimes[1].substring(0, 3).toUpperCase()],
        nomeTimes,
        idFootballApiTimes: [],
        canais,
        escudos: ["", ""],
        date: parseDataHoraBR(diaFormatado, hora),
        destaque: false,
        sub20: isSub20FromMatchInfo(td[1], nomeTimes),
        feminino: isFemininoFromMatchInfo(td[1], nomeTimes),
      });
    });
  });

  return games;
}

function dentroDaJanela(diaFormatado: string): boolean {
  const hoje = getBrazilTodayDDMMYYYY();
  for (let i = 0; i <= DIAS_A_FRENTE; i++) if (addDaysToBrazilDate(hoje, i) === diaFormatado) return true;
  return false;
}

export async function getGoalData(diaFormatado: string): Promise<Match[]> {
  if (!dentroDaJanela(diaFormatado)) return [];
  const url = process.env.GOAL_GUIA_URL || URL_PADRAO;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (r.status === 404) throw new Error("página não encontrada (o id da Goal mudou? ajuste GOAL_GUIA_URL)");
    if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
    return parseGoalHTML(await r.text(), diaFormatado);
  } catch (err: any) {
    console.error("Erro ao buscar jogos da Goal:", err.message);
    return [];
  }
}
