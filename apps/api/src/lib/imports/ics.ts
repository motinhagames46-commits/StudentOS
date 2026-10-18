// Parser iCalendar (.ics) — spec §8. Converte VEVENTs num formato normalizado para pré-visualização.
// O conteúdo do ficheiro é tratado como dado não fiável: nada é executado e nada é gravado aqui.
import ICAL from 'ical.js';
import { isValidTimeZone, zonedToInstant, type ImportIssue } from '@studentos/shared';
import { computeSeriesEnd, describeRecurrence, validateRecurrenceRule } from '../recurrence.js';
import type { RawImportItem } from './types.js';

const MAX_EVENTS = 2000;
const MAX_TEXT = 2000;

// Nomes de fuso do Windows usados pelo Outlook → IANA (os mais comuns em Portugal/Europa).
const WINDOWS_ZONES: Record<string, string> = {
  'GMT Standard Time': 'Europe/Lisbon',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'E. Europe Standard Time': 'Europe/Bucharest',
  'Azores Standard Time': 'Atlantic/Azores',
  UTC: 'UTC',
};

export class IcsParseError extends Error {}

interface ConvertedTime {
  instant: Date;
  /** Fuso IANA a usar para expandir recorrências em hora local. */
  timeZone: string;
  issue: ImportIssue | null;
}

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Converte uma data/hora iCalendar num instante, resolvendo o fuso de forma explícita. */
function convertTime(prop: ICAL.Property, field: string, defaultTz: string): ConvertedTime {
  const t = prop.getFirstValue() as ICAL.Time;
  const tzid = prop.getParameter('tzid') as string | undefined;

  const isUtc = !t.isDate && (t.zone === ICAL.Timezone.utcTimezone || t.zone?.tzid === 'UTC');
  if (isUtc) {
    return {
      instant: new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)),
      timeZone: tzid && isValidTimeZone(tzid) ? tzid : defaultTz,
      issue: null,
    };
  }

  if (tzid) {
    const iana = isValidTimeZone(tzid) ? tzid : WINDOWS_ZONES[tzid];
    if (iana) {
      return {
        instant: zonedToInstant(t.year, t.month, t.day, t.isDate ? 0 : t.hour, t.isDate ? 0 : t.minute, iana),
        timeZone: iana,
        issue: null,
      };
    }
    // Fuso desconhecido mas definido no ficheiro (VTIMEZONE): converter com a definição do ficheiro.
    const zone = ICAL.TimezoneService.get(tzid);
    if (zone) {
      const offsetSeconds = zone.utcOffset(t);
      const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
      return {
        instant: new Date(wall - offsetSeconds * 1000),
        timeZone: defaultTz,
        issue: {
          field,
          severity: 'warning',
          message: `Fuso «${tzid}» convertido pela definição do ficheiro; repetições usam ${defaultTz}`,
        },
      };
    }
    return {
      instant: zonedToInstant(t.year, t.month, t.day, t.hour, t.minute, defaultTz),
      timeZone: defaultTz,
      issue: { field, severity: 'warning', message: `Fuso «${tzid}» desconhecido; assumido ${defaultTz}` },
    };
  }

  // Hora "flutuante" (sem fuso) ou data de dia inteiro: interpretada no fuso do utilizador.
  return {
    instant: zonedToInstant(t.year, t.month, t.day, t.isDate ? 0 : t.hour, t.isDate ? 0 : t.minute, defaultTz),
    timeZone: defaultTz,
    issue: t.isDate ? null : { field, severity: 'warning', message: `Sem fuso horário; assumido ${defaultTz}` },
  };
}

function rootComponents(content: string): ICAL.Component[] {
  let jcal: unknown;
  try {
    jcal = ICAL.parse(content);
  } catch {
    throw new IcsParseError('O ficheiro não é um calendário iCalendar (.ics) válido');
  }
  const roots = Array.isArray(jcal) && typeof jcal[0] === 'string' ? [jcal] : (jcal as unknown[]);
  return (roots as unknown[]).map((r) => new ICAL.Component(r as unknown[]));
}

export function parseIcs(content: string, defaultTz: string): { items: RawImportItem[]; warnings: string[] } {
  const calendars = rootComponents(content);
  if (calendars.length === 0 || calendars.some((c) => c.name !== 'vcalendar')) {
    throw new IcsParseError('O ficheiro não contém um calendário (BEGIN:VCALENDAR)');
  }

  // As definições VTIMEZONE do ficheiro permitem converter fusos com nomes não-IANA.
  for (const cal of calendars) {
    for (const vtz of cal.getAllSubcomponents('vtimezone')) {
      try {
        ICAL.TimezoneService.register(vtz);
      } catch {
        // definição inválida: ignorada; as horas afetadas ficam com aviso
      }
    }
  }

  const events = calendars.flatMap((c) => c.getAllSubcomponents('vevent'));
  if (events.length > MAX_EVENTS) {
    throw new IcsParseError(`O ficheiro tem demasiados eventos (${events.length}; máximo ${MAX_EVENTS})`);
  }

  const warnings: string[] = [];
  let cancelled = 0;
  const items: RawImportItem[] = [];
  // RECURRENCE-ID: ocorrências alteradas → excluídas da série e importadas como evento próprio.
  const overriddenStarts = new Map<string, Date[]>();

  for (const ve of events) {
    if (String(ve.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') {
      cancelled++;
      continue;
    }
    const issues: ImportIssue[] = [];
    const uid = text(ve.getFirstPropertyValue('uid'), 500);
    const title = text(ve.getFirstPropertyValue('summary'), 200);
    if (!title) issues.push({ field: 'title', severity: 'error', message: 'Evento sem título' });

    const dtstartProp = ve.getFirstProperty('dtstart');
    if (!dtstartProp) {
      items.push(
        emptyItem(title, uid, [...issues, { field: 'startAt', severity: 'error', message: 'Sem data de início' }]),
      );
      continue;
    }
    const startTime = dtstartProp.getFirstValue() as ICAL.Time;
    const allDay = startTime.isDate;
    const start = convertTime(dtstartProp, 'startAt', defaultTz);
    if (start.issue) issues.push(start.issue);

    let endAt: Date;
    const dtendProp = ve.getFirstProperty('dtend');
    const duration = ve.getFirstPropertyValue('duration') as ICAL.Duration | null;
    if (dtendProp) {
      const end = convertTime(dtendProp, 'endAt', defaultTz);
      endAt = end.instant;
    } else if (duration) {
      endAt = new Date(start.instant.getTime() + duration.toSeconds() * 1000);
    } else {
      endAt = allDay ? zonedNextDay(startTime, start.timeZone) : start.instant;
    }
    if (endAt < start.instant) {
      issues.push({ field: 'endAt', severity: 'error', message: 'O fim é anterior ao início' });
    }

    const recurrenceIdProp = ve.getFirstProperty('recurrence-id');
    let externalId = uid;
    if (recurrenceIdProp && uid) {
      const rid = convertTime(recurrenceIdProp, 'recurrenceId', defaultTz).instant;
      externalId = `${uid}#${rid.toISOString()}`;
      overriddenStarts.set(uid, [...(overriddenStarts.get(uid) ?? []), rid]);
    }

    const rrule = ve.getFirstPropertyValue('rrule') as ICAL.Recur | null;
    const recurrenceRule = rrule && !recurrenceIdProp ? rrule.toString() : null;
    const exceptionDates: Date[] = [];
    for (const exProp of ve.getAllProperties('exdate')) {
      const tzid = exProp.getParameter('tzid') as string | undefined;
      for (const value of exProp.getValues() as ICAL.Time[]) {
        const single = new ICAL.Property('exdate');
        single.setValue(value);
        if (tzid) single.setParameter('tzid', tzid);
        exceptionDates.push(convertTime(single, 'exceptionDates', start.timeZone).instant);
      }
    }

    const isDeadline = !allDay && endAt.getTime() === start.instant.getTime();
    const transparent = String(ve.getFirstPropertyValue('transp') ?? '').toUpperCase() === 'TRANSPARENT';
    let seriesEndAt: Date | null = endAt;
    let recurrenceSummary: string | null = null;

    if (recurrenceRule) {
      const series = { startAt: start.instant, endAt, timezone: start.timeZone, exceptionDates };
      const ruleError = validateRecurrenceRule(recurrenceRule, series);
      if (ruleError) {
        issues.push({ field: 'recurrenceRule', severity: 'error', message: ruleError });
      } else {
        seriesEndAt = computeSeriesEnd({ ...series, recurrenceRule });
        recurrenceSummary = describeRecurrence(recurrenceRule, seriesEndAt, start.timeZone, start.instant);
        if (!seriesEndAt) {
          issues.push({
            field: 'recurrenceRule',
            severity: 'warning',
            message: 'Série sem data de fim: as aulas aparecem em todas as semanas futuras',
          });
        }
      }
    }
    if (allDay && !transparent) {
      issues.push({
        field: 'isBusy',
        severity: 'warning',
        message: 'Evento de dia inteiro: por omissão não bloqueia o planeamento de estudo',
      });
    }

    const categories = text(ve.getFirstPropertyValue('categories'), 200);
    items.push({
      target: isDeadline ? 'task' : 'block',
      title: title ?? '',
      kind: isDeadline || allDay ? 'EVENT' : recurrenceRule ? 'CLASS' : 'EVENT',
      startAt: start.instant.toISOString(),
      endAt: endAt.toISOString(),
      allDay,
      timezone: start.timeZone,
      location: text(ve.getFirstPropertyValue('location'), 200),
      description: text(ve.getFirstPropertyValue('description')),
      recurrenceRule: issues.some((i) => i.field === 'recurrenceRule' && i.severity === 'error')
        ? null
        : recurrenceRule,
      recurrenceSummary,
      exceptionDates: exceptionDates.map((d) => d.toISOString()),
      seriesEndAt: seriesEndAt ? seriesEndAt.toISOString() : null,
      externalId,
      isBusy: !transparent && !allDay && !isDeadline,
      disciplineId: null,
      disciplineLabel: categories,
      issues,
    });
  }

  // Excluir das séries as ocorrências que o ficheiro redefine com RECURRENCE-ID.
  for (const item of items) {
    const overrides = item.recurrenceRule && item.externalId ? overriddenStarts.get(item.externalId) : undefined;
    if (overrides) item.exceptionDates.push(...overrides.map((d) => d.toISOString()));
  }

  if (cancelled > 0) warnings.push(`${cancelled} evento(s) cancelado(s) no ficheiro foram ignorados`);
  if (items.length === 0) warnings.push('O ficheiro não contém eventos para importar');
  return { items, warnings };
}

function zonedNextDay(t: ICAL.Time, timeZone: string): Date {
  const next = t.clone();
  next.adjust(1, 0, 0, 0);
  return zonedToInstant(next.year, next.month, next.day, 0, 0, timeZone);
}

function emptyItem(title: string | null, uid: string | null, issues: ImportIssue[]): RawImportItem {
  return {
    target: 'block',
    title: title ?? '',
    kind: 'EVENT',
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: 'Europe/Lisbon',
    location: null,
    description: null,
    recurrenceRule: null,
    recurrenceSummary: null,
    exceptionDates: [],
    seriesEndAt: null,
    externalId: uid,
    isBusy: true,
    disciplineId: null,
    disciplineLabel: null,
    issues,
  };
}
