import * as cheerio from 'cheerio';
import { httpGet } from './http';
import { JogoEsporte, LinhaTabela, Tabela } from './tipos';
import { diaEHora, noIntervalo, ordenarPorData, siglaDe } from './util';

const LNB_JOGOS = 'https://lnb.com.br/nbb/tabela-de-jogos/';
export const NBB_LOGO = 'https://lnb.com.br/wp-content/themes/lnb-2016/images/logos/logonbb2020.png';

/** Os canais vêm como logo; o `alt` tem o nome. Alguns nomes saem melhores escritos de outro jeito. */
const NOMES_CANAIS: Record<string, string> = { xsports: 'Xsports', youtube: 'YouTube NBB', 'disney+': 'Disney+' };

type JogoLnb = JogoEsporte & { fase: string; rodada: number | null };

function texto($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim();
}

/** "17/10/2026" + "16:00" (horário de Brasília) -> Date. */
function dataLnb(dia: string, hora: string): Date | null {
  const d = dia.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!d) return null;
  const [h, m] = (hora.match(/(\d{1,2}):(\d{2})/)?.slice(1) ?? ['12', '00']).map(Number);
  return new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1]), h + 3, m));
}

/** Lê a tabela de jogos da temporada atual no site da LNB. */
export async function getNbbTemporada(): Promise<JogoLnb[]> {
  const html = await httpGet<string>(LNB_JOGOS, { responseType: 'text' });
  const $ = cheerio.load(html);
  const jogos: JogoLnb[] = [];

  $('tr').each((_, tr) => {
    const $tr = $(tr);
    const id = $tr.find('td.position_value[data-real-id]').attr('data-real-id');
    if (!id) return;

    const spans = $tr.find('td.date_value.show-for-medium span');
    const date = dataLnb(texto(spans.eq(0)), texto(spans.eq(1)));
    if (!date) return;

    const casa = texto($tr.find('td.home_team_value .team-shortname'));
    const fora = texto($tr.find('td.visitor_team_value .team-shortname'));
    if (!casa || !fora) return;

    const siglas = $tr
      .find('td.matche_for_small strong')
      .map((__, s) => texto($(s)))
      .get();
    const pontosCasa = Number(texto($tr.find('td.score_value span.home')));
    const pontosFora = Number(texto($tr.find('td.score_value span.away')));
    const terminou = texto($tr.find('td.score_value span.home')) !== '' && !Number.isNaN(pontosCasa) && !Number.isNaN(pontosFora);

    const canais = $tr
      .find('td.logo_tv_value img')
      .map((__, img) => String($(img).attr('alt') || $(img).attr('title') || '').trim())
      .get()
      .filter(Boolean)
      .map((c) => NOMES_CANAIS[c.toLowerCase()] ?? c);

    const ginasio = texto($tr.find('td.gym_value').clone().children('div').remove().end());
    const fase = texto($tr.find('td.stage_value').first());

    jogos.push({
      gameId: id,
      campeonato: 'NBB',
      logoCampeonato: NBB_LOGO,
      estadio: ginasio || 'Não informado',
      times: [siglas[0] || siglaDe(casa), siglas[1] || siglaDe(fora)],
      nomeTimes: [casa, fora],
      idFootballApiTimes: [],
      escudos: [
        $tr.find('td.logo_home_team img').attr('src') || '',
        $tr.find('td.logo_visitor_team img').attr('src') || '',
      ],
      canais: [...new Set(canais)],
      date,
      ...diaEHora(date),
      destaque: false,
      sub20: false,
      feminino: false,
      placar: terminou ? [pontosCasa, pontosFora] : null,
      fase,
      rodada: Number(texto($tr.find('td.game_value .number')).replace(/\D/g, '')) || null,
    });
  });

  return ordenarPorData(jogos);
}

/** Jogos do NBB entre duas datas (dd-mm-aaaa, inclusivo, horário de Brasília). */
export async function getNbbJogos(inicio: string, fim: string): Promise<JogoEsporte[]> {
  return (await getNbbTemporada())
    .filter((j) => noIntervalo(j.date, inicio, fim))
    .map(({ fase: _fase, rodada: _rodada, ...jogo }) => jogo);
}

/**
 * Classificação da fase de turno e returno, calculada dos jogos já terminados.
 * Critério do NBB: aproveitamento (vitória vale 2, derrota vale 1 ponto). Desempate por
 * vitórias e saldo. ponytail: sem confronto direto, que só pesa no fim da temporada.
 */
export async function getNbbTabela(): Promise<Tabela> {
  const jogos = (await getNbbTemporada()).filter((j) => j.placar && /turno/i.test(j.fase));
  const linhas = new Map<string, LinhaTabela>();

  const linha = (nome: string, sigla: string, escudo: string) => {
    if (!linhas.has(nome)) {
      linhas.set(nome, {
        posicao: 0,
        time: { nome, sigla, escudo: escudo || null },
        pontos: 0, jogos: 0, vitorias: 0, empates: null, derrotas: 0,
        pro: 0, contra: 0, saldo: 0, aproveitamento: 0, zona: null,
      });
    }
    return linhas.get(nome)!;
  };

  for (const j of jogos) {
    const [pc, pf] = j.placar!;
    [0, 1].forEach((lado) => {
      const l = linha(j.nomeTimes[lado], j.times[lado], j.escudos[lado]);
      const feitos = lado === 0 ? pc : pf;
      const sofridos = lado === 0 ? pf : pc;
      l.jogos += 1;
      l.pro += feitos;
      l.contra += sofridos;
      if (feitos > sofridos) {
        l.vitorias += 1;
        l.pontos += 2;
      } else {
        l.derrotas += 1;
        l.pontos += 1;
      }
    });
  }

  const ordenadas = [...linhas.values()]
    .map((l) => ({ ...l, saldo: l.pro - l.contra, aproveitamento: l.jogos ? Math.round((l.vitorias / l.jogos) * 1000) / 10 : 0 }))
    .sort((a, b) => b.aproveitamento - a.aproveitamento || b.vitorias - a.vitorias || b.saldo - a.saldo);

  ordenadas.forEach((l, i) => {
    l.posicao = i + 1;
    l.zona = i < 4 ? 'quartas' : i < 12 ? 'oitavas' : null;
  });

  const ano = jogos[0]?.date.getUTCFullYear() ?? new Date().getUTCFullYear();
  return {
    liga: 'nbb',
    nome: 'NBB',
    esporte: 'basquete',
    temporada: `${ano}/${String(ano + 1).slice(-2)}`,
    logo: NBB_LOGO,
    unidade: 'pontos',
    zonas: [
      { id: 'quartas', nome: 'Direto nas quartas de final', cor: '#16a34a' },
      { id: 'oitavas', nome: 'Oitavas de final', cor: '#0ea5e9' },
    ],
    grupos: [{ nome: null, linhas: ordenadas }],
    atualizadoEm: new Date(),
  };
}
