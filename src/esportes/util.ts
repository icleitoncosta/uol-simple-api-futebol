import { formatBrazilDateDDMMYYYY, formatBrazilHora } from '../brazil-time';

/** dd-mm-aaaa -> Date às 00:00 de Brasília (03:00 UTC). */
export function inicioDoDia(dia: string): Date {
  const [d, m, a] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 3, 0, 0));
}

/** dd-mm-aaaa -> Date às 23:59:59 de Brasília. */
export function fimDoDia(dia: string): Date {
  const [d, m, a] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1, 2, 59, 59, 999));
}

export function noIntervalo(date: Date, inicio: string, fim: string): boolean {
  return date >= inicioDoDia(inicio) && date <= fimDoDia(fim);
}

export function diaEHora(date: Date): { dia: string; hora: string } {
  return { dia: formatBrazilDateDDMMYYYY(date), hora: formatBrazilHora(date) };
}

/** dd-mm-aaaa -> aaaammdd */
export function paraYmd(dia: string): string {
  const [d, m, a] = dia.split('-');
  return `${a}${m}${d}`;
}

/** Sigla de 3 letras a partir do nome, quando a fonte não manda. */
export function siglaDe(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ')
    .trim();
  const palavras = limpo.split(/\s+/).filter((p) => p.length > 2);
  const base = palavras.length > 1 ? palavras.map((p) => p[0]).join('') : limpo.replace(/\s/g, '');
  return base.slice(0, 3).toUpperCase();
}

/** Primeira letra maiúscula em cada palavra: "SESI VOLEI BAURU" -> "Sesi Volei Bauru". */
export function capitalizar(texto: string): string {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return texto
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    // Duas letras fora da lista (RJ, SP, EC) são sigla: ficam em maiúscula.
    .map((p, i) =>
      i > 0 && minusculas.has(p) ? p : p.length === 2 && /^[a-z]+$/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)
    )
    .join(' ');
}

const PAISES: Record<string, string> = {
  brazil: 'br', brasil: 'br', mexico: 'mx', 'united states': 'us', usa: 'us', qatar: 'qa', portugal: 'pt',
  spain: 'es', italy: 'it', 'united kingdom': 'gb', uk: 'gb', 'great britain': 'gb', france: 'fr', germany: 'de',
  austria: 'at', netherlands: 'nl', belgium: 'be', hungary: 'hu', monaco: 'mc', canada: 'ca', japan: 'jp',
  china: 'cn', australia: 'au', bahrain: 'bh', 'saudi arabia': 'sa', azerbaijan: 'az', singapore: 'sg',
  uae: 'ae', 'united arab emirates': 'ae', 'abu dhabi': 'ae', argentina: 'ar', thailand: 'th', malaysia: 'my',
  indonesia: 'id', india: 'in', 'czech republic': 'cz', czechia: 'cz', finland: 'fi', 'san marino': 'sm',
  turkey: 'tr', kazakhstan: 'kz',
};

/** Nome do país em inglês ou código alfa-2 -> código alfa-2 minúsculo. */
export function codigoPais(paisOuCodigo: string | null | undefined): string | null {
  if (!paisOuCodigo) return null;
  const v = paisOuCodigo.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(v)) return v;
  return PAISES[v] ?? null;
}

export function bandeiraDe(codigo: string | null): string | null {
  return codigo ? `https://flagcdn.com/w80/${codigo}.png` : null;
}

export function ordenarPorData<T extends { date: Date }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.date.getTime() - b.date.getTime());
}
