import { Match } from '../types/api';

/** Jogo de esporte com dois lados (NBB, vôlei), no mesmo formato do futebol. */
export type JogoEsporte = Match & {
  /** Id do jogo na fonte, para gravar e não duplicar. */
  gameId: string;
  /** dd-mm-aaaa no fuso de São Paulo. */
  dia: string;
  /** Placar quando o jogo já terminou (pontos no basquete, sets no vôlei). */
  placar: [number, number] | null;
};

export type TipoSessao = 'treino' | 'quali' | 'sprint' | 'corrida';

/** Sessão de automobilismo (F1, MotoGP): treino, classificação, sprint ou corrida. */
export interface Sessao {
  /** Id estável: evento + sessão. */
  id: string;
  esporte: 'f1' | 'motogp';
  /** "Fórmula 1", "MotoGP". */
  campeonato: string;
  logoCampeonato: string | null;
  /** Nome do GP: "GP de São Paulo". */
  evento: string;
  /** Número da etapa na temporada, quando a fonte informa. */
  etapa: number | null;
  temporada: number;
  tipo: TipoSessao;
  /** Código curto: FP1, FP2, Q, SQ, SPR, RACE... */
  codigo: string;
  /** "Treino livre 1", "Classificação", "Corrida". */
  nome: string;
  circuito: string;
  cidade: string;
  /** ISO 3166 alfa-2 em minúsculas (br, mx...), quando der pra descobrir. */
  pais: string | null;
  bandeira: string | null;
  date: Date;
  /** "15h30" no horário de Brasília. */
  hora: string;
  /** dd-mm-aaaa no horário de Brasília. */
  dia: string;
  canais: string[];
}

/**
 * Globoplay não é canal: é o app onde a TV Globo/SporTV também passa. Na arte ele só ocupa espaço
 * ao lado de quem transmite de verdade, então sai de todos os esportes.
 */
export const semGloboplay = (canais: string[]): string[] => canais.filter((c) => !/globo\s*play/i.test(c));

export type UnidadeTabela = 'gols' | 'pontos' | 'sets';

export interface ZonaTabela {
  id: string;
  nome: string;
  /** Cor da faixa (hex). */
  cor: string;
}

export interface LinhaTabela {
  posicao: number;
  time: { nome: string; sigla: string | null; escudo: string | null };
  pontos: number;
  jogos: number;
  vitorias: number;
  /** Não existe no basquete nem no vôlei. */
  empates: number | null;
  derrotas: number;
  /** Gols, pontos ou sets marcados (ver `unidade` da tabela). */
  pro: number;
  contra: number;
  saldo: number;
  /** 0 a 100. */
  aproveitamento: number;
  zona: string | null;
}

export interface GrupoTabela {
  nome: string | null;
  linhas: LinhaTabela[];
}

export interface Tabela {
  liga: string;
  nome: string;
  esporte: 'futebol' | 'basquete' | 'volei';
  temporada: string;
  logo: string | null;
  unidade: UnidadeTabela;
  zonas: ZonaTabela[];
  grupos: GrupoTabela[];
  atualizadoEm: Date;
}
