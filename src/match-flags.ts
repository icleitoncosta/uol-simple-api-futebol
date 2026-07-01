const FEMININO_LEAGUE_PATTERN =
  /\b(women|women's|womens|feminine|feminino|femenil|femenina|feminil)\b/i;

const SUB20_LEAGUE_PATTERN =
  /\b(u\s?-?\s?20|sub\s?-?\s?20|sub20)\b/i;

const TEAM_WOMEN_SUFFIX = /\s+W$/i;
const TEAM_SUB20_PATTERN = /\b(u\s?-?\s?20|sub\s?-?\s?20|sub20)\b/i;
const DISPLAY_WOMEN_SUFFIX = /\s*\(F\)\s*$/i;

function textoIndicaFeminino(...textos: Array<string | undefined | null>): boolean {
  return textos.some((texto) => {
    if (!texto) return false;
    const valor = texto.trim();
    if (!valor) return false;
    return (
      FEMININO_LEAGUE_PATTERN.test(valor) ||
      TEAM_WOMEN_SUFFIX.test(valor) ||
      DISPLAY_WOMEN_SUFFIX.test(valor)
    );
  });
}

function textoIndicaSub20(...textos: Array<string | undefined | null>): boolean {
  return textos.some((texto) => {
    if (!texto) return false;
    const valor = texto.trim();
    if (!valor) return false;
    return SUB20_LEAGUE_PATTERN.test(valor) || TEAM_SUB20_PATTERN.test(valor);
  });
}

/**
 * API-Football não expõe flags explícitas; inferimos pelo nome da liga e dos times.
 */
export function isFemininoFromApiFixture(fixtureData: any): boolean {
  const league = fixtureData.league || {};
  const teams = fixtureData.teams || {};
  return textoIndicaFeminino(
    league.name,
    teams.home?.name,
    teams.away?.name,
  );
}

export function isSub20FromApiFixture(fixtureData: any): boolean {
  const league = fixtureData.league || {};
  const teams = fixtureData.teams || {};
  return textoIndicaSub20(
    league.name,
    teams.home?.name,
    teams.away?.name,
  );
}

export function isFemininoFromMatchInfo(
  campeonato: string,
  nomeTimes: string[],
): boolean {
  return textoIndicaFeminino(campeonato, ...nomeTimes);
}

export function isSub20FromMatchInfo(
  campeonato: string,
  nomeTimes: string[],
): boolean {
  return textoIndicaSub20(campeonato, ...nomeTimes);
}
