import { httpGet } from './http';
import { getNbbTabela } from './nbb';
import { LinhaTabela, Tabela, ZonaTabela } from './tipos';
import { getSuperligaTabela } from './volei';

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer';

const Z = {
  liberta: { id: 'libertadores', nome: 'Libertadores', cor: '#16a34a' },
  preLiberta: { id: 'pre-libertadores', nome: 'Pré-Libertadores', cor: '#86c440' },
  sula: { id: 'sul-americana', nome: 'Sul-Americana', cor: '#0ea5e9' },
  rebaixa: { id: 'rebaixamento', nome: 'Rebaixamento', cor: '#dc2626' },
  acesso: { id: 'acesso', nome: 'Acesso', cor: '#16a34a' },
  classif: { id: 'classificado', nome: 'Classificado', cor: '#16a34a' },
  sulaRepescagem: { id: 'sul-americana', nome: 'Vai pra Sul-Americana', cor: '#0ea5e9' },
  ucl: { id: 'champions', nome: 'Champions League', cor: '#16a34a' },
  uel: { id: 'europa', nome: 'Europa League', cor: '#0ea5e9' },
  uecl: { id: 'conference', nome: 'Conference League', cor: '#14b8a6' },
  playoffRebaixa: { id: 'playoff-rebaixamento', nome: 'Playoff contra o rebaixamento', cor: '#f59e0b' },
  oitavas: { id: 'oitavas', nome: 'Oitavas de final', cor: '#16a34a' },
  playoffs: { id: 'playoffs', nome: 'Playoffs', cor: '#0ea5e9' },
  wildcard: { id: 'wildcard', nome: 'Repescagem', cor: '#f59e0b' },
} satisfies Record<string, ZonaTabela>;

/** Faixa por posição: [primeira, última, zona]. Posição negativa conta do fim (-1 = último). */
type Faixa = [number, number, ZonaTabela];

export interface LigaInfo {
  id: string;
  nome: string;
  esporte: 'futebol' | 'basquete' | 'volei';
  /** Slug da ESPN; ausente nas que vêm de outra fonte. */
  espn?: string;
  faixas?: Faixa[];
}

/**
 * Campeonatos com tabela. As faixas seguem o regulamento da temporada 2026 e são
 * só visuais. ponytail: ajuste aqui quando o regulamento mudar.
 */
export const LIGAS: LigaInfo[] = [
  { id: 'brasileirao-a', nome: 'Brasileirão Série A', esporte: 'futebol', espn: 'bra.1', faixas: [[1, 4, Z.liberta], [5, 6, Z.preLiberta], [7, 12, Z.sula], [-4, -1, Z.rebaixa]] },
  { id: 'brasileirao-b', nome: 'Brasileirão Série B', esporte: 'futebol', espn: 'bra.2', faixas: [[1, 4, Z.acesso], [-4, -1, Z.rebaixa]] },
  { id: 'libertadores', nome: 'Copa Libertadores', esporte: 'futebol', espn: 'conmebol.libertadores', faixas: [[1, 2, Z.classif], [3, 3, Z.sulaRepescagem]] },
  { id: 'sul-americana', nome: 'Copa Sul-Americana', esporte: 'futebol', espn: 'conmebol.sudamericana', faixas: [[1, 1, Z.oitavas], [2, 2, Z.playoffs]] },
  { id: 'champions', nome: 'UEFA Champions League', esporte: 'futebol', espn: 'uefa.champions', faixas: [[1, 8, Z.oitavas], [9, 24, Z.playoffs]] },
  { id: 'europa-league', nome: 'UEFA Europa League', esporte: 'futebol', espn: 'uefa.europa', faixas: [[1, 8, Z.oitavas], [9, 24, Z.playoffs]] },
  { id: 'premier-league', nome: 'Premier League', esporte: 'futebol', espn: 'eng.1', faixas: [[1, 4, Z.ucl], [5, 5, Z.uel], [6, 6, Z.uecl], [-3, -1, Z.rebaixa]] },
  { id: 'laliga', nome: 'LaLiga', esporte: 'futebol', espn: 'esp.1', faixas: [[1, 4, Z.ucl], [5, 6, Z.uel], [7, 7, Z.uecl], [-3, -1, Z.rebaixa]] },
  { id: 'serie-a-italia', nome: 'Serie A (Itália)', esporte: 'futebol', espn: 'ita.1', faixas: [[1, 4, Z.ucl], [5, 6, Z.uel], [7, 7, Z.uecl], [-3, -1, Z.rebaixa]] },
  { id: 'bundesliga', nome: 'Bundesliga', esporte: 'futebol', espn: 'ger.1', faixas: [[1, 4, Z.ucl], [5, 5, Z.uel], [6, 6, Z.uecl], [-3, -3, Z.playoffRebaixa], [-2, -1, Z.rebaixa]] },
  { id: 'ligue-1', nome: 'Ligue 1', esporte: 'futebol', espn: 'fra.1', faixas: [[1, 4, Z.ucl], [5, 5, Z.uel], [6, 6, Z.uecl], [-3, -3, Z.playoffRebaixa], [-2, -1, Z.rebaixa]] },
  { id: 'liga-portugal', nome: 'Liga Portugal', esporte: 'futebol', espn: 'por.1', faixas: [[1, 2, Z.ucl], [3, 3, Z.uel], [4, 4, Z.uecl], [-3, -3, Z.playoffRebaixa], [-2, -1, Z.rebaixa]] },
  { id: 'mls', nome: 'MLS', esporte: 'futebol', espn: 'usa.1', faixas: [[1, 7, Z.playoffs], [8, 9, Z.wildcard]] },
  { id: 'nbb', nome: 'NBB', esporte: 'basquete' },
  { id: 'superliga-feminina', nome: 'Superliga Feminina', esporte: 'volei' },
  { id: 'superliga-masculina', nome: 'Superliga Masculina', esporte: 'volei' },
];

function stat(entry: any, nome: string): number {
  const s = (entry.stats || []).find((x: any) => x.name === nome);
  return Number(s?.value ?? s?.displayValue ?? 0) || 0;
}

function zonaDe(posicao: number, total: number, faixas: Faixa[] = []): string | null {
  const abs = (p: number) => (p < 0 ? total + p + 1 : p);
  return faixas.find(([a, b]) => posicao >= abs(a) && posicao <= abs(b))?.[2].id ?? null;
}

/** "Group A" -> "Grupo A". */
function nomeGrupo(nome: string | undefined): string | null {
  if (!nome) return null;
  return nome.replace(/^group\s+/i, 'Grupo ').replace(/eastern conference/i, 'Conferência Leste').replace(/western conference/i, 'Conferência Oeste');
}

async function tabelaEspn(liga: LigaInfo): Promise<Tabela> {
  const data = await httpGet<any>(`${ESPN_STANDINGS}/${liga.espn}/standings`);
  const filhos: any[] = data?.children?.length ? data.children : [data];
  const multiplos = filhos.length > 1;

  const grupos = filhos.map((g) => {
    const entries: any[] = g?.standings?.entries ?? [];
    const linhas: LinhaTabela[] = entries
      .map((e) => {
        const jogos = stat(e, 'gamesPlayed');
        const pontos = stat(e, 'points');
        return {
          posicao: stat(e, 'rank'),
          time: {
            nome: e.team?.displayName || e.team?.name || '',
            sigla: e.team?.abbreviation || null,
            escudo: e.team?.logos?.[0]?.href || null,
          },
          pontos,
          jogos,
          vitorias: stat(e, 'wins'),
          empates: stat(e, 'ties'),
          derrotas: stat(e, 'losses'),
          pro: stat(e, 'pointsFor'),
          contra: stat(e, 'pointsAgainst'),
          saldo: stat(e, 'pointDifferential'),
          aproveitamento: jogos ? Math.round((pontos / (jogos * 3)) * 1000) / 10 : 0,
          zona: null as string | null,
        };
      })
      .sort((a, b) => a.posicao - b.posicao || b.pontos - a.pontos);

    // Rank 0 quando a ESPN ainda não ordenou: usa a ordem que veio.
    linhas.forEach((l, i) => {
      if (!l.posicao) l.posicao = i + 1;
      l.zona = zonaDe(l.posicao, linhas.length, liga.faixas);
    });
    return { nome: multiplos ? nomeGrupo(g.name) : null, linhas };
  });

  const usadas = new Set(grupos.flatMap((g) => g.linhas.map((l) => l.zona)).filter(Boolean));
  const zonas = (liga.faixas ?? []).map((f) => f[2]).filter((z, i, arr) => usadas.has(z.id) && arr.findIndex((x) => x.id === z.id) === i);

  return {
    liga: liga.id,
    nome: liga.nome,
    esporte: 'futebol',
    // "2026 CONMEBOL Libertadores" -> "2026"; "2026-27 English Premier League" -> "2026-27"
    temporada:
      String(filhos[0]?.standings?.seasonDisplayName || '').match(/\d{4}(?:[-/]\d{2,4})?/)?.[0] ||
      String(data?.season?.year || new Date().getUTCFullYear()),
    logo: data?.id ? `https://a.espncdn.com/i/leaguelogos/soccer/500/${data.id}.png` : null,
    unidade: 'gols',
    zonas,
    grupos,
    atualizadoEm: new Date(),
  };
}

/** Tabela de um campeonato pelo id de `LIGAS`. */
export async function getTabela(id: string): Promise<Tabela> {
  const liga = LIGAS.find((l) => l.id === id);
  if (!liga) throw new Error(`Campeonato desconhecido: ${id}`);
  if (liga.id === 'nbb') return getNbbTabela();
  if (liga.id === 'superliga-feminina') return getSuperligaTabela('feminino');
  if (liga.id === 'superliga-masculina') return getSuperligaTabela('masculino');
  return tabelaEspn(liga);
}
