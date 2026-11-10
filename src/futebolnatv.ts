import * as cheerio from "cheerio";
import { Match } from "./types/api";
import { parseDataHoraBR } from ".";
import { addDaysToBrazilDate, getBrazilTodayDDMMYYYY } from "./brazil-time";
import { isFemininoFromMatchInfo, isSub20FromMatchInfo } from "./match-flags";

function getUrlByDate(diaFormatado: string): string {
  const hojeFormatado = getBrazilTodayDDMMYYYY();
  const amanhaFormatado = addDaysToBrazilDate(hojeFormatado, 1);
  const ontemFormatado = addDaysToBrazilDate(hojeFormatado, -1);
  
  if (diaFormatado === hojeFormatado) {
    return `https://www.futebolnatv.com.br/jogos-hoje/`;
  } else if (diaFormatado === amanhaFormatado) {
    return `https://www.futebolnatv.com.br/jogos-amanha/`;
  } else if (diaFormatado === ontemFormatado) {
    return `https://www.futebolnatv.com.br/jogos-ontem/`;
  } else {
    // Se não for hoje, amanhã ou ontem, usar jogos-hoje como padrão
    return `https://www.futebolnatv.com.br/jogos-hoje/`;
  }
}

function getBrowserLikeHeaders(url: string): Record<string, string> {
  return {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=0, i",
    "sec-ch-ua": "\"Google Chrome\";v=\"145\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"145\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "referer": url,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function resolveChannelName(mainChannel: string, subChannel: string): string {
  if (mainChannel.toUpperCase() === "YOUTUBE") {
    const match = subChannel.match(/^\((.+)\)$/);
    if (match) {
      return normalizeText(match[1]);
    }
  }
  return mainChannel;
}

export async function getFutebolNaTVData(diaFormatado: any): Promise<Match[]> {
  const url = getUrlByDate(diaFormatado);

  try {
    const headers = getBrowserLikeHeaders(url);
    const response = await fetch(url, {
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    if (!html) {
      console.warn("Não foi possível obter HTML, retornando array vazio");
      return [];
    }

    const $ = cheerio.load(html);
    const games = parseGamesFromHTML($, diaFormatado);

    return games;

  } catch (err: any) {
    console.error("Erro ao buscar jogos do Futebol na TV:", err.message);
    return [];
  }
}

function parseGamesFromHTML($: cheerio.CheerioAPI, diaFormatado: string): Match[] {
  const games: Match[] = [];

  // Layout atual do site: <article class="match">. O antigo (#fntv-jogos-por-hora) fica de fallback.
  const novos = $("article.match");
  if (novos.length > 0) {
    novos.each((_, element) => {
      try {
        const game = extractGameFromMatchCard($, $(element), diaFormatado);
        if (game) games.push(game);
      } catch (err) {
        console.warn("Erro ao processar card do Futebol na TV:", err);
      }
    });
    return games;
  }

  const cards = $("#fntv-jogos-por-hora article");

  cards.each((index, element) => {
    try {
      const $gamecard = $(element);
      const game = extractGameFromGamecard($, $gamecard, diaFormatado);
      if (game) {
        games.push(game);
      }
    } catch (err) {
      console.warn("Erro ao processar gamecard:", err);
    }
  });

  return games;
}

// Hora de Brasília a partir do timestamp (data-ts, em segundos): jogo que ainda não começou não traz o horário em texto.
function horaBrasilia(ts: number): string {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ts * 1000));
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${h === "24" ? "00" : h}h${m}`;
}

function extractGameFromMatchCard($: cheerio.CheerioAPI, $card: cheerio.Cheerio<any>, diaFormatado: string): Match | null {
  const campeonato = normalizeText($card.find(".m-head p b").first().text()) || "Campeonato não informado";

  const ts = Number($card.attr("data-ts"));
  let hora = Number.isFinite(ts) && ts > 0 ? horaBrasilia(ts) : "";
  if (!hora) {
    const m = normalizeText($card.find(".m-time small").first().text()).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    hora = `${m[1].padStart(2, "0")}h${m[2]}`;
  }

  const nomes = $card.find(".m-team .m-name").map((_, el) => normalizeText($(el).text())).get();
  if (nomes.length < 2 || !nomes[0] || !nomes[1]) return null;
  const [time1, time2] = nomes;

  const canais: string[] = [];
  $card.find(".m-channels > span").each((_, el) => {
    const principal = normalizeText($(el).find("b").first().text());
    if (!principal) return;
    const secundario = normalizeText($(el).find("small").first().text());
    const canal = resolveChannelName(principal, secundario);
    if (canal && !canais.includes(canal)) canais.push(canal);
  });
  if (canais.length === 0) return null;

  const escudos: string[] = $card
    .find("img.m-crest")
    .map((_, img) => {
      const src = $(img).attr("src") || "";
      return src.startsWith("http") ? src : src ? `https://www.futebolnatv.com.br${src.startsWith("/") ? "" : "/"}${src}` : "";
    })
    .get()
    .slice(0, 2) as string[];
  while (escudos.length < 2) escudos.push("");

  const nomeTimes = [time1, time2];
  return {
    campeonato,
    logoCampeonato: null,
    estadio: "Não informado",
    hora,
    times: [time1.substring(0, 3).toUpperCase(), time2.substring(0, 3).toUpperCase()],
    nomeTimes,
    idFootballApiTimes: [],
    canais,
    escudos,
    date: parseDataHoraBR(diaFormatado, hora),
    destaque: false,
    sub20: isSub20FromMatchInfo(campeonato, nomeTimes),
    feminino: isFemininoFromMatchInfo(campeonato, nomeTimes),
  };
}

function extractGameFromGamecard($: cheerio.CheerioAPI, $gamecard: cheerio.Cheerio<any>, diaFormatado: string): Match | null {
  try {
    const campeonatoNode = $gamecard.find("span.font-bold").first();
    const campeonato = normalizeText(campeonatoNode.text()) || "Campeonato não informado";

    const horaRaw = normalizeText($gamecard.find("time").first().text());
    if (!horaRaw) {
      return null;
    }
    const horaMatch = horaRaw.match(/(\d{1,2}):(\d{2})/);
    if (!horaMatch) {
      return null;
    }
    const hora = `${horaMatch[1].padStart(2, "0")}h${horaMatch[2]}`;

    // O layout novo usa IDs estáveis para os dois times.
    let time1 = normalizeText(
      $gamecard.find("div[id^='jogo-card-team-a-'] img[alt]").first().attr("alt") || ""
    );
    let time2 = normalizeText(
      $gamecard.find("div[id^='jogo-card-team-b-'] img[alt]").first().attr("alt") || ""
    );

    // Fallback para layouts antigos/alternativos.
    if (!time1 || !time2) {
      const timesDivs = $gamecard
        .find("div.flex.items-center.justify-between span.truncate")
        .filter((_, el) => !$(el).text().includes(":"));

      const times: string[] = [];
      timesDivs.each((i, el) => {
        const timeLimpo = normalizeText($(el).text());
        if (timeLimpo && timeLimpo.length > 0) {
          times.push(timeLimpo);
        }
      });

      if (times.length >= 2) {
        time1 = times[0];
        time2 = times[1];
      }
    }

    if (!time1 || !time2) {
      return null;
    }

    const canais: string[] = [];
    $gamecard.find("span.hero-tv").each((_, el) => {
      const $heroTv = $(el);
      const canalPrincipal = normalizeText($heroTv.next("span").text());
      if (!canalPrincipal) {
        return;
      }
      const canalSecundario = normalizeText($heroTv.next("span").next("span").text());
      const canalFinal = resolveChannelName(canalPrincipal, canalSecundario);
      if (canalFinal && !canais.includes(canalFinal)) {
        canais.push(canalFinal);
      }
    });

    if (canais.length === 0) {
      return null;
    }

    const escudos: string[] = $gamecard
      .find("img[alt]")
      .map((_, img) => {
        const src = $(img).attr("src");
        const alt = normalizeText($(img).attr("alt") || "");
        if (!src || !alt || alt === campeonato) {
          return "";
        }
        if (!src.includes("/upload/teams/")) {
          return "";
        }
        return src.startsWith("http")
          ? src
          : `https://www.futebolnatv.com.br${src.startsWith("/") ? "" : "/"}${src}`;
      })
      .get()
      .filter((src) => Boolean(src))
      .slice(0, 2) as string[];

    while (escudos.length < 2) {
      escudos.push("");
    }

    const nomeTimes = [time1, time2];

    return {
      campeonato: campeonato,
      logoCampeonato: null,
      estadio: "Não informado",
      hora: hora,
      times: [time1.substring(0, 3).toUpperCase(), time2.substring(0, 3).toUpperCase()],
      nomeTimes,
      idFootballApiTimes: [],
      canais: canais,
      escudos: escudos,
      date: parseDataHoraBR(diaFormatado, hora),
      destaque: false,
      sub20: isSub20FromMatchInfo(campeonato, nomeTimes),
      feminino: isFemininoFromMatchInfo(campeonato, nomeTimes),
    };
  } catch (err) {
    console.warn("Erro ao extrair jogo do gamecard:", err);
    return null;
  }
}
