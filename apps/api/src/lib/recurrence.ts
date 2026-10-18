// Recorrências (spec §6.1): as séries guardam a regra RRULE e geram ocorrências apenas no intervalo
// pedido. A expansão é feita em hora local do fuso da série, para que "segunda às 10:00" continue a
// ser às 10:00 depois da mudança de hora.
import ICAL from 'ical.js';
import { instantToZoned, zonedToInstant } from '@studentos/shared';

const ALLOWED_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
/** Limite de iterações por série e por pedido (proteção contra regras abusivas). */
const MAX_ITERATIONS = 5000;
/** Uma regra não pode gerar mais do que isto em 2 anos. */
const MAX_OCCURRENCES_2Y = 1100;

export interface SeriesLike {
  startAt: Date;
  endAt: Date;
  timezone: string;
  recurrenceRule: string | null;
  exceptionDates: Date[];
}

export interface Occurrence {
  start: Date;
  end: Date;
}

function iteratorFor(series: SeriesLike) {
  const recur = ICAL.Recur.fromString(series.recurrenceRule!);
  const p = instantToZoned(series.startAt, series.timezone);
  // DTSTART "flutuante" em hora local; cada ocorrência é depois convertida no fuso da série.
  const dtstart = ICAL.Time.fromData({
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    second: 0,
    isDate: false,
  });
  return recur.iterator(dtstart);
}

function toInstant(t: ICAL.Time, timeZone: string): Date {
  return zonedToInstant(t.year, t.month, t.day, t.hour, t.minute, timeZone);
}

/** Valida uma RRULE: devolve uma mensagem de erro em português, ou null se for aceitável. */
export function validateRecurrenceRule(rule: string, series: Omit<SeriesLike, 'recurrenceRule'>): string | null {
  let recur: ICAL.Recur;
  try {
    recur = ICAL.Recur.fromString(rule);
  } catch {
    return 'Regra de recorrência inválida';
  }
  if (!recur.freq || !ALLOWED_FREQ.has(recur.freq)) {
    return 'Recorrência não suportada (só diária, semanal, mensal ou anual)';
  }
  if (recur.interval < 1) return 'Intervalo de recorrência inválido';
  const twoYears = new Date(series.startAt.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  const count = expandOccurrences(
    { ...series, recurrenceRule: rule },
    series.startAt,
    twoYears,
    MAX_OCCURRENCES_2Y + 1,
  );
  if (count.length > MAX_OCCURRENCES_2Y) return 'Recorrência demasiado frequente';
  return null;
}

/** Ocorrências que se sobrepõem a [from, to). Séries sem regra têm uma única ocorrência. */
export function expandOccurrences(series: SeriesLike, from: Date, to: Date, maxCount = 1000): Occurrence[] {
  const durationMs = series.endAt.getTime() - series.startAt.getTime();
  if (!series.recurrenceRule) {
    return series.startAt < to && series.endAt > from ? [{ start: series.startAt, end: series.endAt }] : [];
  }

  const excluded = new Set(series.exceptionDates.map((d) => d.getTime()));
  const it = iteratorFor(series);
  const out: Occurrence[] = [];
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = it.next();
    if (!next) break;
    const start = toInstant(next, series.timezone);
    if (start >= to) break;
    const end = new Date(start.getTime() + durationMs);
    if (end <= from || excluded.has(start.getTime())) continue;
    out.push({ start, end });
    if (out.length >= maxCount) break;
  }
  return out;
}

/** Fim da última ocorrência, ou null se a série não tiver fim (sem UNTIL nem COUNT). */
export function computeSeriesEnd(series: SeriesLike): Date | null {
  if (!series.recurrenceRule) return series.endAt;
  const recur = ICAL.Recur.fromString(series.recurrenceRule);
  if (!recur.until && !recur.count) return null;
  const durationMs = series.endAt.getTime() - series.startAt.getTime();
  const it = iteratorFor(series);
  let last: ICAL.Time | null = null;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = it.next();
    if (!next) break;
    last = next.clone(); // o iterador reutiliza o mesmo objeto Time
  }
  return last ? new Date(toInstant(last, series.timezone).getTime() + durationMs) : series.endAt;
}

const WEEKDAYS_PT: Record<string, string> = {
  MO: 'seg',
  TU: 'ter',
  WE: 'qua',
  TH: 'qui',
  FR: 'sex',
  SA: 'sáb',
  SU: 'dom',
};

/** Resumo legível de uma RRULE, ex.: "Semanal (seg, qua) até 31/01/2027". */
export function describeRecurrence(
  rule: string,
  seriesEndAt: Date | null,
  timeZone: string,
  seriesStart?: Date,
): string {
  let recur: ICAL.Recur;
  try {
    recur = ICAL.Recur.fromString(rule);
  } catch {
    return 'Recorrência';
  }
  const every = recur.interval > 1 ? ` (a cada ${recur.interval})` : '';
  const base =
    recur.freq === 'DAILY'
      ? 'Diária'
      : recur.freq === 'WEEKLY'
        ? 'Semanal'
        : recur.freq === 'MONTHLY'
          ? 'Mensal'
          : recur.freq === 'YEARLY'
            ? 'Anual'
            : 'Recorrente';
  const startWeekday = seriesStart
    ? Object.values(WEEKDAYS_PT)[instantToZoned(seriesStart, timeZone).weekday - 1]
    : null;
  const byDay =
    (recur.parts.BYDAY as string[] | undefined)?.map((d) => WEEKDAYS_PT[d.slice(-2)] ?? d).join(', ') ??
    (recur.freq === 'WEEKLY' ? startWeekday : null);
  const days = byDay ? ` (${byDay})` : '';
  if (!seriesEndAt) return `${base}${every}${days}, sem data de fim`;
  const end = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(
    seriesEndAt,
  );
  return `${base}${every}${days} até ${end}`;
}

/** RRULE semanal até ao fim do dia `untilDay` (aaaa-mm-dd) em hora local. */
export function weeklyUntilRule(untilDay: string, timeZone: string): string {
  const [y, m, d] = untilDay.split('-').map(Number) as [number, number, number];
  const until = zonedToInstant(y, m, d, 23, 59, timeZone);
  const stamp = until
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return `FREQ=WEEKLY;UNTIL=${stamp}`;
}
