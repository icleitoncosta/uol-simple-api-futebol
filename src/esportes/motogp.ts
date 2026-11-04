import { httpGet } from './http';
import { Sessao, TipoSessao } from './tipos';
import { bandeiraDe, codigoPais, diaEHora, noIntervalo, ordenarPorData } from './util';

const MOTOGP_API = 'https://api.pulselive.motogp.com/motogp/v1/events';

/**
 * Onde passa no Brasil. A API só traz o horário.
 * ponytail: lista fixa; troque aqui se o contrato de TV mudar.
 */
export const MOTOGP_CANAIS = ['ESPN', 'Disney+'];

/** Só as sessões da categoria principal, sem coletiva nem warm up. */
const TIPOS: Record<string, TipoSessao> = { PRACTICE: 'treino', QUALIFYING: 'quali', RACE: 'corrida' };

function infoSessao(b: any): { codigo: string; nome: string; tipo: TipoSessao } | null {
  const tipo = TIPOS[b.kind];
  if (!tipo) return null;
  const sigla = String(b.shortname || '').trim();
  if (sigla === 'SPR') return { codigo: 'SPR', nome: 'Sprint', tipo: 'sprint' };
  if (sigla === 'RAC') return { codigo: 'RACE', nome: 'Corrida', tipo: 'corrida' };
  if (sigla === 'PR') return { codigo: 'PR', nome: 'Treino', tipo: 'treino' };
  const n = sigla.match(/\d+/)?.[0] ?? '';
  if (tipo === 'quali') return { codigo: `Q${n}`, nome: `Classificação ${n}`.trim(), tipo };
  return { codigo: `FP${n}`, nome: `Treino livre ${n}`.trim(), tipo };
}

const PAIS_PT: Record<string, string> = {
  qatar: 'Catar', portugal: 'Portugal', valencia: 'Valência', spain: 'Espanha', italy: 'Itália',
  'san marino and the rimini riviera': 'San Marino', 'the americas': 'Américas', argentina: 'Argentina',
  brazil: 'Brasil', thailand: 'Tailândia', japan: 'Japão', australia: 'Austrália', malaysia: 'Malásia',
  indonesia: 'Indonésia', france: 'França', germany: 'Alemanha', netherlands: 'Holanda', austria: 'Áustria',
  hungary: 'Hungria', 'czechia': 'Tchéquia', 'great britain': 'Grã-Bretanha', aragon: 'Aragão',
  catalonia: 'Catalunha', 'jerez': 'Jerez',
};

/** "QATAR AIRWAYS GRAND PRIX OF QATAR" -> "GP do Catar" vira "GP Catar". */
function nomeDoGp(e: any): string {
  const de = String(e.name || '').match(/GRAND PRIX OF (?:THE )?(.+)$/i)?.[1]?.trim().toLowerCase();
  const base = de ? PAIS_PT[de] ?? de.replace(/\b\w/g, (c) => c.toUpperCase()) : e.circuit?.place || e.name;
  return `GP ${base}`;
}

async function sessoesDoAno(ano: number): Promise<Sessao[]> {
  const eventos: any[] = await httpGet(MOTOGP_API, { params: { seasonYear: ano } });
  const gps = (eventos || []).filter((e) => e.kind === 'GP' && e.status !== 'CANCELLED');
  return gps.flatMap((e, i) => {
    const pais = codigoPais(e.country);
    return (e.broadcasts || []).flatMap((b: any) => {
      if (b.type !== 'SESSION' || b.category?.acronym !== 'MGP') return [];
      const s = infoSessao(b);
      if (!s) return [];
      const date = new Date(b.date_start);
      const sessao: Sessao = {
        id: `motogp-${ano}-${e.id}-${s.codigo}`.toLowerCase(),
        esporte: 'motogp',
        campeonato: 'MotoGP',
        logoCampeonato: null,
        evento: nomeDoGp(e),
        etapa: Number(e.sequence) || i + 1,
        temporada: ano,
        codigo: s.codigo,
        nome: s.nome,
        tipo: s.tipo,
        circuito: e.circuit?.name ?? '',
        cidade: e.circuit?.place ?? '',
        pais,
        bandeira: bandeiraDe(pais),
        date,
        ...diaEHora(date),
        canais: MOTOGP_CANAIS,
      };
      return [sessao];
    });
  });
}

/** Sessões da MotoGP entre duas datas (dd-mm-aaaa, inclusivo, horário de Brasília). */
export async function getMotoGpSessoes(inicio: string, fim: string): Promise<Sessao[]> {
  const anos = [...new Set([inicio, fim].map((d) => Number(d.slice(-4))))];
  const todas = (await Promise.all(anos.map(sessoesDoAno))).flat();
  return ordenarPorData(todas.filter((s) => noIntervalo(s.date, inicio, fim)));
}

/** Todas as sessões do próximo GP que ainda não terminou. */
export async function getMotoGpProximoGp(agora: Date = new Date()): Promise<Sessao[]> {
  const ano = agora.getUTCFullYear();
  const todas = ordenarPorData(
    (await Promise.all([ano, ano + 1].map((a) => sessoesDoAno(a).catch(() => [] as Sessao[])))).flat()
  );
  const proxima = todas.find((s) => s.tipo === 'corrida' && s.date.getTime() > agora.getTime() - 3 * 3600_000);
  if (!proxima) return [];
  return todas.filter((s) => s.evento === proxima.evento && s.temporada === proxima.temporada);
}
