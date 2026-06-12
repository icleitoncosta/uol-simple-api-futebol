/**
 * Chaves canônicas para cruzar nomes da API-Sports (inglês) com UOL / Futebol na TV (pt-BR).
 */

function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeLookupKey(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/\s*\(f\)\s*/gi, " ")
    .replace(/\s+sub-20\s*/gi, " ")
    .replace(/\s+u20\s*/gi, " ")
    .replace(/\s+w\s*$/gi, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+e\s+/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** canonical id -> variantes (en, pt-BR, abreviações comuns em sites BR) */
const NATIONAL_TEAM_GROUPS: Record<string, string[]> = {
  albania: ["albania", "albania"],
  algeria: ["algeria", "argelia"],
  andorra: ["andorra"],
  angola: ["angola"],
  argentina: ["argentina"],
  armenia: ["armenia", "armenia"],
  australia: ["australia", "australia"],
  austria: ["austria", "austria"],
  azerbaijan: ["azerbaijan", "azerbaijao"],
  bahrain: ["bahrain", "barein"],
  belarus: ["belarus", "bielorrussia"],
  belgium: ["belgium", "belgica"],
  bolivia: ["bolivia", "bolivia"],
  "bosnia-herzegovina": ["bosnia", "bosnia and herzegovina", "bosnia-herzegovina", "bosnia e herzegovina"],
  brazil: ["brazil", "brasil"],
  bulgaria: ["bulgaria", "bulgaria"],
  cameroon: ["cameroon", "camaroes"],
  canada: ["canada", "canada"],
  chile: ["chile"],
  china: ["china", "china"],
  colombia: ["colombia", "colombia"],
  "costa-rica": ["costa rica", "costa rica"],
  croatia: ["croatia", "croacia"],
  cuba: ["cuba"],
  cyprus: ["cyprus", "chipre"],
  "czech-republic": ["czech republic", "czechia", "republica tcheca", "tchequia"],
  denmark: ["denmark", "dinamarca"],
  ecuador: ["ecuador", "equador"],
  egypt: ["egypt", "egito"],
  england: ["england", "inglaterra"],
  estonia: ["estonia", "estonia"],
  finland: ["finland", "finlandia"],
  france: ["france", "franca"],
  georgia: ["georgia", "georgia"],
  germany: ["germany", "alemanha"],
  ghana: ["ghana", "gana"],
  greece: ["greece", "grecia"],
  guatemala: ["guatemala"],
  honduras: ["honduras"],
  hungary: ["hungary", "hungria"],
  iceland: ["iceland", "islandia"],
  india: ["india", "india"],
  indonesia: ["indonesia", "indonesia"],
  iran: ["iran", "ira"],
  iraq: ["iraq", "iraque"],
  ireland: ["ireland", "republic of ireland", "irlanda"],
  israel: ["israel"],
  italy: ["italy", "italia"],
  "ivory-coast": ["ivory coast", "cote d'ivoire", "costa do marfim"],
  jamaica: ["jamaica", "jamaica"],
  japan: ["japan", "japao"],
  jordan: ["jordan", "jordania"],
  kazakhstan: ["kazakhstan", "cazaquistao"],
  kosovo: ["kosovo"],
  latvia: ["latvia", "letonia"],
  liechtenstein: ["liechtenstein"],
  lithuania: ["lithuania", "lituania"],
  luxembourg: ["luxembourg", "luxemburgo"],
  malawi: ["malawi", "malaui"],
  malta: ["malta"],
  mexico: ["mexico", "mexico"],
  moldova: ["moldova", "moldavia"],
  montenegro: ["montenegro"],
  morocco: ["morocco", "marrocos"],
  netherlands: ["netherlands", "holanda", "paises baixos"],
  "new-zealand": ["new zealand", "nova zelandia"],
  nicaragua: ["nicaragua"],
  nigeria: ["nigeria", "nigeria"],
  "north-ireland": ["northern ireland", "irlanda do norte"],
  "north-macedonia": ["north macedonia", "macedonia", "macedonia do norte"],
  norway: ["norway", "noruega"],
  oman: ["oman", "oma"],
  pakistan: ["pakistan", "paquistao"],
  palestine: ["palestine", "palestina"],
  panama: ["panama", "panama"],
  paraguay: ["paraguay", "paraguai"],
  peru: ["peru"],
  poland: ["poland", "polonia"],
  portugal: ["portugal"],
  qatar: ["qatar", "catar"],
  romania: ["romania", "romenia"],
  russia: ["russia", "russia"],
  "saudi-arabia": ["saudi arabia", "arabia saudita"],
  scotland: ["scotland", "escocia"],
  senegal: ["senegal"],
  serbia: ["serbia", "servia"],
  slovakia: ["slovakia", "eslovaquia"],
  slovenia: ["slovenia", "eslovenia"],
  "south-africa": ["south africa", "africa do sul"],
  "south-korea": ["south korea", "korea republic", "coreia do sul"],
  spain: ["spain", "espanha"],
  sweden: ["sweden", "suecia"],
  switzerland: ["switzerland", "suica"],
  syria: ["syria", "siria"],
  thailand: ["thailand", "tailandia"],
  tunisia: ["tunisia", "tunisia"],
  turkey: ["turkey", "turquia"],
  ukraine: ["ukraine", "ucrania"],
  "united-arab-emirates": ["united arab emirates", "uae", "emirados arabes"],
  uruguay: ["uruguay", "uruguai"],
  usa: ["usa", "united states", "estados unidos", "eua"],
  uzbekistan: ["uzbekistan", "uzbequistao"],
  venezuela: ["venezuela"],
  vietnam: ["vietnam", "vietna"],
  wales: ["wales", "pais de gales"],
  zambia: ["zambia", "zambia"],
  zimbabwe: ["zimbabwe", "zimbabue"],
};

const ALIAS_TO_CANONICAL = new Map<string, string>();

for (const [canonical, variants] of Object.entries(NATIONAL_TEAM_GROUPS)) {
  for (const variant of variants) {
    const key = normalizeLookupKey(variant);
    if (key) {
      ALIAS_TO_CANONICAL.set(key, canonical);
    }
  }
}

export function toNationalTeamKey(name: string): string | null {
  const key = normalizeLookupKey(name);
  if (!key) return null;
  return ALIAS_TO_CANONICAL.get(key) ?? null;
}

/** Nome exibido em pt-BR por chave canônica */
const NATIONAL_TEAM_DISPLAY_PT: Record<string, string> = {
  albania: "Albânia",
  algeria: "Argélia",
  andorra: "Andorra",
  angola: "Angola",
  argentina: "Argentina",
  armenia: "Armênia",
  australia: "Austrália",
  austria: "Áustria",
  azerbaijan: "Azerbaijão",
  bahrain: "Bahrein",
  belarus: "Bielorrússia",
  belgium: "Bélgica",
  bolivia: "Bolívia",
  "bosnia-herzegovina": "Bósnia e Herzegovina",
  brazil: "Brasil",
  bulgaria: "Bulgária",
  cameroon: "Camarões",
  canada: "Canadá",
  chile: "Chile",
  china: "China",
  colombia: "Colômbia",
  "costa-rica": "Costa Rica",
  croatia: "Croácia",
  cuba: "Cuba",
  cyprus: "Chipre",
  "czech-republic": "República Tcheca",
  denmark: "Dinamarca",
  ecuador: "Equador",
  egypt: "Egito",
  england: "Inglaterra",
  estonia: "Estônia",
  finland: "Finlândia",
  france: "França",
  georgia: "Geórgia",
  germany: "Alemanha",
  ghana: "Gana",
  greece: "Grécia",
  guatemala: "Guatemala",
  honduras: "Honduras",
  hungary: "Hungria",
  iceland: "Islândia",
  india: "Índia",
  indonesia: "Indonésia",
  iran: "Irã",
  iraq: "Iraque",
  ireland: "Irlanda",
  israel: "Israel",
  italy: "Itália",
  "ivory-coast": "Costa do Marfim",
  jamaica: "Jamaica",
  japan: "Japão",
  jordan: "Jordânia",
  kazakhstan: "Cazaquistão",
  kosovo: "Kosovo",
  latvia: "Letônia",
  liechtenstein: "Liechtenstein",
  lithuania: "Lituânia",
  luxembourg: "Luxemburgo",
  malawi: "Malaui",
  malta: "Malta",
  mexico: "México",
  moldova: "Moldávia",
  montenegro: "Montenegro",
  morocco: "Marrocos",
  netherlands: "Holanda",
  "new-zealand": "Nova Zelândia",
  nicaragua: "Nicarágua",
  nigeria: "Nigéria",
  "north-ireland": "Irlanda do Norte",
  "north-macedonia": "Macedônia do Norte",
  norway: "Noruega",
  oman: "Omã",
  pakistan: "Paquistão",
  palestine: "Palestina",
  panama: "Panamá",
  paraguay: "Paraguai",
  peru: "Peru",
  poland: "Polônia",
  portugal: "Portugal",
  qatar: "Catar",
  romania: "Romênia",
  russia: "Rússia",
  "saudi-arabia": "Arábia Saudita",
  scotland: "Escócia",
  senegal: "Senegal",
  serbia: "Sérvia",
  slovakia: "Eslováquia",
  slovenia: "Eslovênia",
  "south-africa": "África do Sul",
  "south-korea": "Coreia do Sul",
  spain: "Espanha",
  sweden: "Suécia",
  switzerland: "Suíça",
  syria: "Síria",
  thailand: "Tailândia",
  tunisia: "Tunísia",
  turkey: "Turquia",
  ukraine: "Ucrânia",
  "united-arab-emirates": "Emirados Árabes",
  uruguay: "Uruguai",
  usa: "Estados Unidos",
  uzbekistan: "Uzbequistão",
  venezuela: "Venezuela",
  vietnam: "Vietnã",
  wales: "País de Gales",
  zambia: "Zâmbia",
  zimbabwe: "Zimbábue",
};

function formatWomenSuffix(apiName: string, displayName: string): string {
  if (/\s+W$/i.test(apiName.trim()) || /\s*\(F\)\s*$/i.test(displayName)) {
    return displayName.replace(/\s*\(F\)\s*$/i, "").trim() + " (F)";
  }
  return displayName;
}

/**
 * Converte nome da API (inglês) para exibição pt-BR quando for seleção mapeada.
 */
export function toBrazilianTeamDisplayName(apiName: string): string {
  const raw = apiName.trim();
  const canonical = toNationalTeamKey(raw.replace(/\s+W$/i, ""));
  if (canonical && NATIONAL_TEAM_DISPLAY_PT[canonical]) {
    return formatWomenSuffix(raw, NATIONAL_TEAM_DISPLAY_PT[canonical]);
  }
  return raw.replace(/\s+W$/i, " (F)");
}

const LEAGUE_NAME_PT: Record<string, string> = {
  friendlies: "Amistoso Internacional",
};

const LEAGUE_ID_PT: Record<number, string> = {
  1: "Copa do Mundo",
  10: "Amistoso Internacional",
};

/**
 * Traduz nome de campeonato da API para pt-BR quando aplicável.
 */
export function formatCampeonatoName(leagueName: string, leagueId?: number): string {
  if (leagueId != null && LEAGUE_ID_PT[leagueId]) {
    return LEAGUE_ID_PT[leagueId];
  }
  const key = normalizeLookupKey(leagueName);
  return LEAGUE_NAME_PT[key] ?? leagueName;
}

/**
 * Compara dois nomes de time (clubes ou seleções).
 * Seleções: usa mapa EN/PT-BR; clubes: fallback por substring.
 */
export function teamsMatchName(nameA: string, nameB: string): boolean {
  const cleanA = normalizeLookupKey(nameA);
  const cleanB = normalizeLookupKey(nameB);

  if (!cleanA || !cleanB) return false;

  const canonA = ALIAS_TO_CANONICAL.get(cleanA);
  const canonB = ALIAS_TO_CANONICAL.get(cleanB);

  if (canonA && canonB) {
    return canonA === canonB;
  }

  return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
}
