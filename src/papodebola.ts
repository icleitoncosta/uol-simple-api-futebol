import * as cheerio from "cheerio";
import { Match } from "./types/api";
import { parseDataHoraBR } from ".";
import { addDaysToBrazilDate, formatBrazilDateDDMMYYYY, formatBrazilHora, getBrazilTodayDDMMYYYY } from "./brazil-time";
import { isFemininoFromMatchInfo, isSub20FromMatchInfo } from "./match-flags";

const BASE = "https://www.papodebola.com.br";
// O site só mostra de hoje até 6 dias à frente.
const MAX_DIAS_A_FRENTE = 6;
const PARALELO = 4;

const HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "pt-BR,pt;q=0.9",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
};

const normalizeText = (t: string) => t.replace(/\s+/g, " ").trim();

/** A data da consulta precisa estar na janela que o site cobre (hoje até +6 dias). */
export function dentroDaJanela(diaFormatado: string): boolean {
  const hoje = getBrazilTodayDDMMYYYY();
  for (let i = 0; i <= MAX_DIAS_A_FRENTE; i++) {
    if (addDaysToBrazilDate(hoje, i) === diaFormatado) return true;
  }
  return false;
}

export interface PapoCard {
  url: string; // caminho do jogo: /futebol/<liga>/jogo/DD-MM-YYYY/<slug>
  campeonato: string;
  times: [string, string];
  dia: string; // DD-MM-YYYY, tirado da URL
}

/** Lista da página ?d=YYYY-MM-DD. Só vale card cuja data na URL for a do dia pedido. */
export function parseLista(html: string, diaFormatado: string): PapoCard[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const cards: PapoCard[] = [];

  $('a[href*="/futebol/"][href*="/jogo/"]').each((_, a) => {
    const $a = $(a);
    const url = ($a.attr("href") || "").split("?")[0];
    const m = url.match(/^\/futebol\/[^/]+\/jogo\/(\d{2}-\d{2}-\d{4})\/[^/]+$/);
    if (!m || m[1] !== diaFormatado || vistos.has(url)) return;
    const times = $a.find("span.truncate").map((__, e) => normalizeText($(e).text())).get();
    if (times.length < 2 || !times[0] || !times[1]) return;
    vistos.add(url);
    cards.push({
      url,
      campeonato: normalizeText($a.find("> div > div").first().text()) || "Campeonato não informado",
      times: [times[0], times[1]],
      dia: m[1],
    });
  });

  return cards;
}

export interface PapoJogo {
  canais: string[];
  inicio: Date | null;
}

/** Página do jogo: canais em "Quando é e onde assistir" e o início (UTC) no JSON-LD SportsEvent. */
export function parseJogo(html: string): PapoJogo {
  const $ = cheerio.load(html);

  const box = $("h2")
    .filter((_, e) => /onde assistir/i.test($(e).text()))
    .first()
    .nextAll("div.space-y-2")
    .first();
  const canais: string[] = [];
  box.children("div").each((_, e) => {
    const nome = normalizeText($(e).find("div.text-sm.font-semibold").first().text());
    if (nome && !canais.includes(nome)) canais.push(nome);
  });

  let inicio: Date | null = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).html() || "");
      if (j?.["@type"] === "SportsEvent" && j.startDate) {
        const d = new Date(j.startDate);
        if (!Number.isNaN(d.getTime())) inicio = d;
      }
    } catch {
      /* ld+json inválido: ignora */
    }
  });

  return { canais, inicio };
}

async function baixar(url: string): Promise<string> {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.text();
}

export async function getPapoDeBolaData(diaFormatado: string): Promise<Match[]> {
  if (!dentroDaJanela(diaFormatado)) return [];

  try {
    const [d, m, y] = diaFormatado.split("-");
    const cards = parseLista(await baixar(`${BASE}/jogos-de-hoje?d=${y}-${m}-${d}`), diaFormatado);
    const games: Match[] = [];

    for (let i = 0; i < cards.length; i += PARALELO) {
      const lote = cards.slice(i, i + PARALELO);
      const resultados = await Promise.all(
        lote.map(async (card) => {
          try {
            return { card, jogo: parseJogo(await baixar(`${BASE}${card.url}`)) };
          } catch (err: any) {
            console.warn("Papo de Bola: falha no jogo", card.url, err.message);
            return null;
          }
        })
      );

      for (const r of resultados) {
        if (!r || !r.jogo.inicio || r.jogo.canais.length === 0) continue;
        // a página do jogo também tem que ser do dia pedido (horário de Brasília)
        if (formatBrazilDateDDMMYYYY(r.jogo.inicio) !== diaFormatado) continue;
        const hora = formatBrazilHora(r.jogo.inicio);
        const nomeTimes = [r.card.times[0], r.card.times[1]];
        games.push({
          campeonato: r.card.campeonato,
          logoCampeonato: null,
          estadio: "Não informado",
          hora,
          times: [nomeTimes[0].substring(0, 3).toUpperCase(), nomeTimes[1].substring(0, 3).toUpperCase()],
          nomeTimes,
          idFootballApiTimes: [],
          canais: r.jogo.canais,
          escudos: ["", ""],
          date: parseDataHoraBR(diaFormatado, hora),
          destaque: false,
          sub20: isSub20FromMatchInfo(r.card.campeonato, nomeTimes),
          feminino: isFemininoFromMatchInfo(r.card.campeonato, nomeTimes),
        });
      }
    }

    return games;
  } catch (err: any) {
    console.error("Erro ao buscar jogos do Papo de Bola:", err.message);
    return [];
  }
}
