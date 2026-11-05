import { httpGet } from './http';
import { JogoEsporte, LinhaTabela, Tabela, semGloboplay } from './tipos';
import { capitalizar, diaEHora, noIntervalo, ordenarPorData, siglaDe } from './util';

export type GeneroVolei = 'feminino' | 'masculino';

const PAGINAS: Record<GeneroVolei, string> = {
  feminino: 'https://cbv.com.br/volei-de-quadra/superliga-a-feminina/',
  masculino: 'https://cbv.com.br/volei-de-quadra/superliga-a-masculina/',
};

export const SUPERLIGA_LOGO = 'https://cbv.com.br/CBV.gif';

/**
 * O site da CBV é Next.js e manda a temporada inteira da Superliga dentro do HTML,
 * no payload `self.__next_f.push([1,"..."])`. Juntamos esses pedaços e lemos cada
 * objeto de jogo (`{"ChampionshipMatch_ID":...}`).
 */
function payloadNext(html: string): string {
  const partes: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      partes.push(JSON.parse(`"${m[1]}"`));
    } catch {
      // pedaço quebrado não derruba o resto
    }
  }
  return partes.join('');
}

/** Lê o objeto JSON que começa em `inicio`, respeitando strings e chaves aninhadas. */
function objetoEm(texto: string, inicio: number): any | null {
  let nivel = 0;
  let emString = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (c === '\\') i++;
      else if (c === '"') emString = false;
    } else if (c === '"') emString = true;
    else if (c === '{') nivel++;
    else if (c === '}' && --nivel === 0) {
      try {
        return JSON.parse(texto.slice(inicio, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

type TimeCbv = { nome: string; sigla: string; escudo: string | null };

type JogoCbv = JogoEsporte & { sets: [number, number] | null; terminou: boolean };

function timeDe(dados: any, nomePlacar: string): TimeCbv {
  // `sge_nome_placar` é o nome curto do placar e às vezes vem cortado; o `Name` é o oficial.
  const nome = capitalizar(dados?.Name || dados?.custom_data?.sge_nome_placar || nomePlacar);
  return {
    nome,
    sigla: dados?.ShortCodeName || dados?.Code || siglaDe(nome),
    escudo: dados?.badge || dados?.custom_data?.sge_logo_clara_url || null,
  };
}

/** Temporada inteira da Superliga A (jogos passados e futuros). */
export async function getSuperligaTemporada(genero: GeneroVolei): Promise<JogoCbv[]> {
  const html = await httpGet<string>(PAGINAS[genero], { responseType: 'text' });
  const payload = payloadNext(html);
  const brutos = new Map<number, any>();
  const times = new Map<number, any>();

  let i = payload.indexOf('{"ChampionshipMatch_ID":');
  while (i >= 0) {
    const jogo = objetoEm(payload, i);
    if (jogo?.ChampionshipMatch_ID) {
      // O mesmo jogo aparece mais de uma vez, cada vez com uma parte dos campos
      // (canal e ginásio numa, elenco noutra). Junta tudo, sem trocar valor por vazio.
      const atual = brutos.get(jogo.ChampionshipMatch_ID) ?? {};
      for (const [k, v] of Object.entries(jogo)) {
        const temValor = v !== null && v !== undefined && !(typeof v === 'string' && v.startsWith('$'));
        if (temValor && (atual[k] === undefined || atual[k] === null)) atual[k] = v;
      }
      brutos.set(jogo.ChampionshipMatch_ID, atual);
      if (jogo.HomeTeamData?.Team_ID) times.set(jogo.HomeTeamData.Team_ID, jogo.HomeTeamData);
      if (jogo.GuestTeamData?.Team_ID) times.set(jogo.GuestTeamData.Team_ID, jogo.GuestTeamData);
    }
    i = payload.indexOf('{"ChampionshipMatch_ID":', i + 24);
  }

  const campeonato = genero === 'feminino' ? 'Superliga Feminina' : 'Superliga Masculina';
  const jogos: JogoCbv[] = [];

  for (const j of brutos.values()) {
    if (j.postponed || !j.MatchDateTime || !j.HomeTeam || !j.GuestTeam) continue;
    const date = new Date(j.MatchDateTime);
    if (Number.isNaN(date.getTime())) continue;
    const casa = timeDe(times.get(j.HomeTeam_ID), j.HomeTeam);
    const fora = timeDe(times.get(j.GuestTeam_ID), j.GuestTeam);
    const terminou = Boolean(j.isFinished) || j.WonSetHome === 3 || j.WonSetGuest === 3;
    const canais: string[] = Array.isArray(j.custom_data?.sge_transmission_names)
      ? j.custom_data.sge_transmission_names
      : j.channel?.Denomination
        ? [j.channel.Denomination]
        : [];

    jogos.push({
      gameId: String(j.ChampionshipMatch_ID),
      campeonato,
      logoCampeonato: SUPERLIGA_LOGO,
      estadio: j.hall?.Denomination ? capitalizar(j.hall.Denomination) : 'Não informado',
      times: [casa.sigla, fora.sigla],
      nomeTimes: [casa.nome, fora.nome],
      idFootballApiTimes: [],
      escudos: [casa.escudo || '', fora.escudo || ''],
      canais: semGloboplay([...new Set(canais.map((c) => c.trim()).filter(Boolean))]),
      date,
      ...diaEHora(date),
      destaque: false,
      sub20: false,
      feminino: genero === 'feminino',
      placar: terminou ? [j.WonSetHome, j.WonSetGuest] : null,
      sets: terminou ? [j.WonSetHome, j.WonSetGuest] : null,
      terminou,
    });
  }

  return ordenarPorData(jogos);
}

/** Jogos da Superliga entre duas datas (dd-mm-aaaa). Sem gênero, traz as duas. */
export async function getVoleiJogos(inicio: string, fim: string, genero?: GeneroVolei): Promise<JogoEsporte[]> {
  const generos: GeneroVolei[] = genero ? [genero] : ['feminino', 'masculino'];
  const temporadas = await Promise.all(generos.map(getSuperligaTemporada));
  return ordenarPorData(
    temporadas
      .flat()
      .filter((j) => noIntervalo(j.date, inicio, fim))
      .map(({ sets: _s, terminou: _t, ...jogo }) => jogo)
  );
}

/**
 * Classificação calculada dos jogos terminados.
 * Pontos: 3x0 e 3x1 dão 3 pontos ao vencedor; 3x2 dá 2 ao vencedor e 1 ao perdedor.
 * Ordem da Superliga: vitórias, pontos, média de sets. `pro`/`contra` são sets.
 */
export async function getSuperligaTabela(genero: GeneroVolei): Promise<Tabela> {
  const jogos = await getSuperligaTemporada(genero);
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

  // Todo time da temporada entra, mesmo sem jogo ainda.
  for (const j of jogos) [0, 1].forEach((lado) => linha(j.nomeTimes[lado], j.times[lado], j.escudos[lado]));

  for (const j of jogos.filter((x) => x.sets)) {
    const [sc, sf] = j.sets!;
    [0, 1].forEach((lado) => {
      const l = linha(j.nomeTimes[lado], j.times[lado], j.escudos[lado]);
      const feitos = lado === 0 ? sc : sf;
      const sofridos = lado === 0 ? sf : sc;
      l.jogos += 1;
      l.pro += feitos;
      l.contra += sofridos;
      if (feitos > sofridos) {
        l.vitorias += 1;
        l.pontos += sofridos === 2 ? 2 : 3;
      } else {
        l.derrotas += 1;
        l.pontos += feitos === 2 ? 1 : 0;
      }
    });
  }

  const media = (l: LinhaTabela) => (l.contra ? l.pro / l.contra : l.pro);
  const ordenadas = [...linhas.values()]
    .map((l) => ({ ...l, saldo: l.pro - l.contra, aproveitamento: l.jogos ? Math.round((l.vitorias / l.jogos) * 1000) / 10 : 0 }))
    .sort((a, b) => b.vitorias - a.vitorias || b.pontos - a.pontos || media(b) - media(a));

  const total = ordenadas.length;
  ordenadas.forEach((l, i) => {
    l.posicao = i + 1;
    l.zona = i < 8 ? 'playoffs' : i >= total - 2 ? 'rebaixamento' : null;
  });

  const ano = jogos[0]?.date.getUTCFullYear() ?? new Date().getUTCFullYear();
  return {
    liga: `superliga-${genero}`,
    nome: genero === 'feminino' ? 'Superliga Feminina' : 'Superliga Masculina',
    esporte: 'volei',
    temporada: `${ano}/${String(ano + 1).slice(-2)}`,
    logo: SUPERLIGA_LOGO,
    unidade: 'sets',
    zonas: [
      { id: 'playoffs', nome: 'Playoffs', cor: '#16a34a' },
      { id: 'rebaixamento', nome: 'Rebaixamento', cor: '#dc2626' },
    ],
    grupos: [{ nome: null, linhas: ordenadas }],
    atualizadoEm: new Date(),
  };
}
