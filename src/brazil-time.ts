export const BR_TIMEZONE = 'America/Sao_Paulo';

export interface BrazilDateParts {
  day: string;
  month: string;
  year: number;
  hours: number;
  minutes: number;
}

export function getBrazilDateParts(date: Date): BrazilDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '0';

  let hours = parseInt(get('hour'), 10);
  if (hours === 24) {
    hours = 0;
  }

  return {
    day: get('day'),
    month: get('month'),
    year: parseInt(get('year'), 10),
    hours,
    minutes: parseInt(get('minute'), 10),
  };
}

export function formatBrazilDateDDMMYYYY(date: Date): string {
  const { day, month, year } = getBrazilDateParts(date);
  return `${day}-${month}-${year}`;
}

export function formatBrazilHora(date: Date): string {
  const { hours, minutes } = getBrazilDateParts(date);
  return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`;
}

export function getBrazilTodayDDMMYYYY(): string {
  return formatBrazilDateDDMMYYYY(new Date());
}

export function addDaysToBrazilDate(dateStr: string, days: number): string {
  const [dia, mes, ano] = dateStr.split('-').map(Number);
  const utc = Date.UTC(ano, mes - 1, dia + days, 12, 0, 0);
  return formatBrazilDateDDMMYYYY(new Date(utc));
}
