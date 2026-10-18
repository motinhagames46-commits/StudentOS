// Conversões entre hora local (num fuso IANA) e instantes absolutos, seguras nas mudanças de hora.
// O backend persiste instantes; a apresentação e as regras "às segundas às 10:00" usam hora local.
import { TZDate } from '@date-fns/tz';

export const DEFAULT_TIMEZONE = 'Europe/Lisbon';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Instante correspondente a uma hora local num fuso (mês 1–12). */
export function zonedToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  return new Date(new TZDate(year, month - 1, day, hour, minute, 0, timeZone).getTime());
}

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  /** 1 = segunda-feira … 7 = domingo (a semana começa à segunda, spec §3.1) */
  weekday: number;
}

export function instantToZoned(date: Date, timeZone: string): ZonedParts {
  const z = new TZDate(date.getTime(), timeZone);
  const dow = z.getDay(); // 0 = domingo
  return {
    year: z.getFullYear(),
    month: z.getMonth() + 1,
    day: z.getDate(),
    hour: z.getHours(),
    minute: z.getMinutes(),
    weekday: dow === 0 ? 7 : dow,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Chave aaaa-mm-dd do dia civil no fuso indicado. */
export function zonedDayKey(date: Date, timeZone: string): string {
  const p = instantToZoned(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Meia-noite local do dia `key` (aaaa-mm-dd) no fuso indicado. */
export function startOfZonedDay(key: string, timeZone: string): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return zonedToInstant(y, m, d, 0, 0, timeZone);
}

/** Soma `days` dias civis a uma chave aaaa-mm-dd (independente do fuso). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Dia da semana (1 = segunda … 7 = domingo) de uma chave aaaa-mm-dd. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}
