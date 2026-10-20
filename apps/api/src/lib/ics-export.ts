// Exportação iCalendar (RFC 5545) do plano para o calendário pessoal (Google, Apple, Outlook).
// Texto gerado à mão para controlar o essencial: escape de TEXT, linhas dobradas a 75 octetos sem partir
// caracteres UTF-8, CRLF, fuso Europe/Lisbon com VTIMEZONE e UID estável por registo.
import { DEFAULT_TIMEZONE, addDaysToKey, instantToZoned } from '@studentos/shared';

export interface ExportEvent {
  /** Estável entre exportações: reimportar atualiza o evento em vez de o duplicar. */
  uid: string;
  summary: string;
  description: string | null;
  lastModified: Date;
  /** Hora exata (sessões planeadas) ou dia inteiro aaaa-mm-dd (avaliações e prazos: os formulários só pedem a data). */
  when: { start: Date; end: Date } | { day: string };
  /** Antecedência do lembrete, em minutos, a partir do início do evento (num dia inteiro: da meia-noite local). */
  alarmMinutesBefore: number;
}

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

/**
 * Lisboa desde 1996 (regra da UE): hora de verão (WEST, +01:00) do último domingo de março às 01:00 UTC
 * ao último domingo de outubro às 01:00 UTC. RFC 5545 §3.6.5 exige um VTIMEZONE por cada TZID usado.
 */
const VTIMEZONE_LISBON = [
  'BEGIN:VTIMEZONE',
  `TZID:${DEFAULT_TIMEZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:WEST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:WET',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Escape do tipo TEXT (RFC 5545 §3.3.11). Caracteres de controlo, exceto a mudança de linha, são retirados. */
export function escapeText(value: string): string {
  return (
    value
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex -- retirar caracteres de controlo é o objetivo
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  );
}

/** Dobra uma linha de conteúdo em blocos de até 75 octetos (RFC 5545 §3.1), sem partir caracteres UTF-8. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    // As linhas de continuação começam com um espaço, que também conta para o limite.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const pad = (n: number) => String(n).padStart(2, '0');

function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Hora local de Lisboa (os desvios do fuso são horas inteiras, por isso os segundos não mudam). */
function lisbonStamp(date: Date): string {
  const z = instantToZoned(date, DEFAULT_TIMEZONE);
  return `${z.year}${pad(z.month)}${pad(z.day)}T${pad(z.hour)}${pad(z.minute)}${pad(date.getUTCSeconds())}`;
}

const dateValue = (dayKey: string) => dayKey.replace(/-/g, '');

function eventLines(event: ExportEvent, now: Date): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `LAST-MODIFIED:${utcStamp(event.lastModified)}`,
  ];
  if ('start' in event.when) {
    lines.push(`DTSTART;TZID=${DEFAULT_TIMEZONE}:${lisbonStamp(event.when.start)}`);
    lines.push(`DTEND;TZID=${DEFAULT_TIMEZONE}:${lisbonStamp(event.when.end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(event.when.day)}`);
    lines.push(`DTEND;VALUE=DATE:${dateValue(addDaysToKey(event.when.day, 1))}`);
  }
  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  // Um prazo ou avaliação de dia inteiro não ocupa o dia inteiro na disponibilidade.
  lines.push(`TRANSP:${'start' in event.when ? 'OPAQUE' : 'TRANSPARENT'}`);
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.summary)}`,
    `TRIGGER:${durationBefore(event.alarmMinutesBefore)}`,
    'END:VALARM',
    'END:VEVENT',
  );
  return lines;
}

/** Duração negativa RFC 5545 (§3.3.6), ex.: 30 → -PT30M, 900 → -PT15H. */
function durationBefore(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `-PT${hours ? `${hours}H` : ''}${rest || !hours ? `${rest}M` : ''}`;
}

/** Ficheiro .ics completo, com CRLF no fim de cada linha (incluindo a última). */
export function buildCalendar(events: ExportEvent[], now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudentOS//Plano de estudo//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'NAME:StudentOS',
    'X-WR-CALNAME:StudentOS',
    `X-WR-TIMEZONE:${DEFAULT_TIMEZONE}`,
    ...VTIMEZONE_LISBON,
    ...events.flatMap((e) => eventLines(e, now)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
