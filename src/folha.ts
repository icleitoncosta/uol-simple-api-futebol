import * as cheerio from "cheerio";
import { Match } from "./types/api";
import { parseDataHoraBR } from ".";
import { isFemininoFromMatchInfo, isSub20FromMatchInfo } from "./match-flags";

const URL_FOLHA = "https://www1.folha.uol.com.br/esporte/jogo-ao-vivo.shtml";

export const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function semAcento(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Dia da semana (0 = domingo) de uma data DD-MM-YYYY. Meio-dia UTC evita virar o dia por fuso. */
export function diaDaSemana(diaFormatado: string): number {
  const [d, m, y] = diaFormatado.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/**
 * A página mostra o dia só como "Terça-feira (10)". Só vale se o número E o dia da semana
 * baterem com a data pedida: a Folha nem sempre atualiza, e jogos de outro dia não podem entrar.
 */
export function tituloEhDoDia(titulo: string, diaFormatado: string): boolean {
  const m = semAcento(normalizeText(titulo)).match(/^([a-z]+)(?:-feira)?\s*\((\d{1,2})\)/);
  if (!m) return false;
  const diaMes = Number(diaFormatado.split("-")[0]);
  return Number(m[2]) === diaMes && m[1] === DIAS_SEMANA[diaDaSemana(diaFormatado)];
}

/** "17h Time A x Time B", "21 Time A x Time B", "17h30 ...". */
export function parseLinhaJogo(texto: string): { hora: string; times: [string, string] } | null {
  const m = normalizeText(texto).match(/^(\d{1,2})(?:h(\d{2})?)?\s+(.+?)\s+x\s+(.+)$/i);
  if (!m) return null;
  const hora = `${m[1].padStart(2, "0")}h${m[2] || "00"}`;
  return { hora, times: [normalizeText(m[3]), normalizeText(m[4])] };
}

/** "Copa do Rei: ESPN 2" -> campeonato + canais. Esportes que não são futebol vêm como "Vôlei, Superliga: SporTV". */
export function parseCanais(texto: string): { campeonato: string; canais: string[] } | null {
  const t = normalizeText(texto);
  const i = t.lastIndexOf(":");
  if (i < 0) return null;
  const campeonato = normalizeText(t.slice(0, i));
  if (!campeonato || campeonato.includes(",")) return null; // outro esporte
  const canais = t
    .slice(i + 1)
    .split(/\s*[,/]\s*|\s+e\s+/i)
    .map(normalizeText)
    .filter(Boolean);
  return canais.length ? { campeonato, canais: Array.from(new Set(canais)) } : null;
}

export function parseFolhaHTML(html: string, diaFormatado: string): Match[] {
  const $ = cheerio.load(html);
  const games: Match[] = [];

  $("li.c-text").each((_, li) => {
    const $li = $(li);
    if (!tituloEhDoDia($li.find("h2.c-text__title").first().text(), diaFormatado)) return;

    $li.find("h3.c-text__subtitle").each((__, h3) => {
      const linha = parseLinhaJogo($(h3).text());
      const info = parseCanais($(h3).next("p").text());
      if (!linha || !info) return;
      const nomeTimes = [linha.times[0], linha.times[1]];
      games.push({
        campeonato: info.campeonato,
        logoCampeonato: null,
        estadio: "Não informado",
        hora: linha.hora,
        times: [nomeTimes[0].substring(0, 3).toUpperCase(), nomeTimes[1].substring(0, 3).toUpperCase()],
        nomeTimes,
        idFootballApiTimes: [],
        canais: info.canais,
        escudos: ["", ""],
        date: parseDataHoraBR(diaFormatado, linha.hora),
        destaque: false,
        sub20: isSub20FromMatchInfo(info.campeonato, nomeTimes),
        feminino: isFemininoFromMatchInfo(info.campeonato, nomeTimes),
      });
    });
  });

  return games;
}

export async function getFolhaData(diaFormatado: string): Promise<Match[]> {
  try {
    const response = await fetch(URL_FOLHA, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return parseFolhaHTML(await response.text(), diaFormatado);
  } catch (err: any) {
    console.error("Erro ao buscar jogos da Folha:", err.message);
    return [];
  }
}
