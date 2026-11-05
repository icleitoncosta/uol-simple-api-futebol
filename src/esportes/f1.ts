import { httpGet } from './http';
import { Sessao, TipoSessao } from './tipos';
import { bandeiraDe, codigoPais, diaEHora, noIntervalo, ordenarPorData, paraYmd } from './util';

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const ESPN_F1 = 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard';
export const F1_LOGO = 'https://a.espncdn.com/i/teamlogos/leagues/500/f1.png';

/**
 * Onde passa no Brasil. As fontes só informam a transmissão dos EUA.
 * ponytail: lista fixa por tipo de sessão; troque aqui se o contrato de TV mudar.
 */
export const F1_CANAIS: Record<TipoSessao, string[]> = {
  treino: ['SporTV', 'F1 TV'],
  quali: ['TV Globo', 'SporTV', 'F1 TV'],
  sprint: ['TV Globo', 'SporTV', 'F1 TV'],
  corrida: ['TV Globo', 'SporTV', 'F1 TV'],
};

type InfoSessao = { codigo: string; nome: string; tipo: TipoSessao };

const SESSOES_JOLPICA: Array<InfoSessao & { chave: string }> = [
  { chave: 'FirstPractice', codigo: 'FP1', nome: 'Treino livre 1', tipo: 'treino' },
  { chave: 'SecondPractice', codigo: 'FP2', nome: 'Treino livre 2', tipo: 'treino' },
  { chave: 'ThirdPractice', codigo: 'FP3', nome: 'Treino livre 3', tipo: 'treino' },
  { chave: 'SprintQualifying', codigo: 'SQ', nome: 'Classificação da sprint', tipo: 'quali' },
  { chave: 'Sprint', codigo: 'SPR', nome: 'Sprint', tipo: 'sprint' },
  { chave: 'Qualifying', codigo: 'Q', nome: 'Classificação', tipo: 'quali' },
];

const CORRIDA: InfoSessao = { codigo: 'RACE', nome: 'Corrida', tipo: 'corrida' };

const SESSOES_ESPN: Record<string, InfoSessao> = {
  FP1: SESSOES_JOLPICA[0],
  FP2: SESSOES_JOLPICA[1],
  FP3: SESSOES_JOLPICA[2],
  SS: SESSOES_JOLPICA[3],
  SQ: SESSOES_JOLPICA[3],
  Sprint: SESSOES_JOLPICA[4],
  Qual: SESSOES_JOLPICA[5],
  Race: CORRIDA,
};

/** A Jolpica às vezes devolve UTF-8 lido como latin1 ("AutÃ³dromo"). */
function consertarAcentos(texto: string): string {
  return /Ã|Â/.test(texto) ? Buffer.from(texto, 'latin1').toString('utf8') : texto;
}

const PATROCINIOS = /^(msc cruises|aramco|heineken|pirelli|qatar airways|etihad airways|lenovo|louis vuitton|crypto\.com|aws|rolex|gulf air|stc|formula 1)\s+/i;

/** Como o GP é chamado no Brasil. A Jolpica usa o adjetivo em inglês ("Brazilian Grand Prix"). */
const GP_PT: Record<string, string> = {
  australian: 'Austrália', chinese: 'China', japanese: 'Japão', bahrain: 'Bahrein', 'saudi arabian': 'Arábia Saudita',
  miami: 'Miami', 'emilia romagna': 'Emília-Romanha', monaco: 'Mônaco', spanish: 'Espanha', 'barcelona-catalunya': 'Barcelona',
  canadian: 'Canadá', austrian: 'Áustria', british: 'Grã-Bretanha', belgian: 'Bélgica', hungarian: 'Hungria', dutch: 'Holanda',
  italian: 'Itália', madrid: 'Madri', azerbaijan: 'Azerbaijão', singapore: 'Singapura', 'united states': 'Estados Unidos',
  'mexico city': 'Cidade do México', mexican: 'México', brazilian: 'São Paulo', 'são paulo': 'São Paulo', 'sao paulo': 'São Paulo',
  'las vegas': 'Las Vegas', qatar: 'Catar', 'abu dhabi': 'Abu Dhabi',
};

/** "MSC Cruises São Paulo Grand Prix" e "Brazilian Grand Prix" -> "GP São Paulo". */
export function nomeDoGp(nome: string): string {
  const base = nome.replace(/grand prix/i, '').trim().replace(PATROCINIOS, '').trim();
  return `GP ${GP_PT[base.toLowerCase()] ?? base}`;
}

type BaseGp = {
  evento: string;
  etapa: number | null;
  temporada: number;
  circuito: string;
  cidade: string;
  pais: string | null;
};

function montar(base: BaseGp, s: InfoSessao, date: Date): Sessao {
  return {
    id: `f1-${base.temporada}-${base.etapa ?? base.evento}-${s.codigo}`.replace(/\s+/g, '-').toLowerCase(),
    esporte: 'f1',
    campeonato: 'Fórmula 1',
    logoCampeonato: F1_LOGO,
    ...base,
    bandeira: bandeiraDe(base.pais),
    codigo: s.codigo,
    nome: s.nome,
    tipo: s.tipo,
    date,
    ...diaEHora(date),
    canais: F1_CANAIS[s.tipo],
  };
}

async function sessoesJolpica(temporada: number): Promise<Sessao[]> {
  const data = await httpGet<any>(`${JOLPICA}/${temporada}.json`, { params: { limit: 100 } });
  const corridas: any[] = data?.MRData?.RaceTable?.Races ?? [];
  return corridas.flatMap((r) => {
    const base: BaseGp = {
      evento: nomeDoGp(r.raceName),
      etapa: Number(r.round) || null,
      temporada,
      circuito: consertarAcentos(r.Circuit?.circuitName ?? ''),
      cidade: consertarAcentos(r.Circuit?.Location?.locality ?? ''),
      pais: codigoPais(r.Circuit?.Location?.country),
    };
    const quando = (x: { date: string; time?: string }) => new Date(`${x.date}T${x.time || '12:00:00Z'}`);
    return [
      ...SESSOES_JOLPICA.filter((s) => r[s.chave]?.date).map((s) => montar(base, s, quando(r[s.chave]))),
      montar(base, CORRIDA, quando(r)),
    ];
  });
}

async function sessoesEspn(inicio: string, fim: string): Promise<Sessao[]> {
  const data = await httpGet<any>(ESPN_F1, { params: { dates: `${paraYmd(inicio)}-${paraYmd(fim)}` } });
  return (data?.events ?? []).flatMap((e: any) => {
    const base: BaseGp = {
      evento: nomeDoGp(e.name ?? ''),
      etapa: null,
      temporada: Number(e.season?.year) || new Date(e.date).getUTCFullYear(),
      circuito: e.circuit?.fullName ?? '',
      cidade: e.circuit?.address?.city ?? '',
      pais: codigoPais(e.circuit?.address?.country),
    };
    return (e.competitions ?? []).flatMap((c: any) => {
      const s = SESSOES_ESPN[c.type?.abbreviation];
      return s ? [montar(base, s, new Date(c.date))] : [];
    });
  });
}

/**
 * Sessões de F1 entre duas datas (dd-mm-aaaa, inclusivo, horário de Brasília).
 * A Jolpica traz a etapa e o calendário inteiro; se ela cair, vai a ESPN.
 */
export async function getF1Sessoes(inicio: string, fim: string): Promise<Sessao[]> {
  const anos = [...new Set([inicio, fim].map((d) => Number(d.slice(-4))))];
  let sessoes: Sessao[];
  try {
    sessoes = (await Promise.all(anos.map(sessoesJolpica))).flat();
  } catch (error: any) {
    console.warn(`[f1] Jolpica falhou (${error?.message}); usando a ESPN.`);
    sessoes = await sessoesEspn(inicio, fim);
  }
  return ordenarPorData(sessoes.filter((s) => noIntervalo(s.date, inicio, fim)));
}

/** Todas as sessões do próximo GP que ainda não terminou. */
export async function getF1ProximoGp(agora: Date = new Date()): Promise<Sessao[]> {
  const ano = agora.getUTCFullYear();
  const todas = ordenarPorData(
    (await Promise.all([ano, ano + 1].map((a) => sessoesJolpica(a).catch(() => [] as Sessao[])))).flat()
  );
  const proxima = todas.find((s) => s.tipo === 'corrida' && s.date.getTime() > agora.getTime() - 3 * 3600_000);
  if (!proxima) return [];
  return todas.filter((s) => s.etapa === proxima.etapa && s.temporada === proxima.temporada);
}
