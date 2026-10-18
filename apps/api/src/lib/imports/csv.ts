// Parser CSV de horários (spec §8.3). Colunas mapeáveis; datas ambíguas nunca são assumidas em silêncio.
import { parse as parseCsvText } from 'csv-parse/sync';
import {
  addDaysToKey,
  weekdayOfKey,
  zonedToInstant,
  type CsvField,
  type CsvPreviewOptions,
  type DateFormat,
  type ImportIssue,
} from '@studentos/shared';
import { computeSeriesEnd, describeRecurrence, weeklyUntilRule } from '../recurrence.js';
import type { RawImportItem } from './types.js';

const MAX_ROWS = 1000;

export class CsvParseError extends Error {}

export interface CsvOptions {
  mapping?: Record<string, CsvField>;
  dateFormat?: DateFormat;
  validFrom?: string;
  validUntil?: string;
}

interface DisciplineRef {
  id: number;
  code: string;
  name: string;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Sinónimos de cabeçalhos (pt-PT e inglês) para o mapeamento automático.
const SYNONYMS: Record<Exclude<CsvField, 'ignore'>, string[]> = {
  title: ['titulo', 'title', 'nome', 'evento', 'aula', 'assunto', 'subject', 'summary'],
  date: ['data', 'date', 'dia mes', 'data aula'],
  startTime: ['inicio', 'hora inicio', 'hora de inicio', 'start', 'start time', 'starttime', 'de', 'hora'],
  endTime: ['fim', 'hora fim', 'hora de fim', 'termino', 'end', 'end time', 'endtime', 'ate'],
  weekday: ['dia da semana', 'dia semana', 'weekday', 'dia'],
  location: ['sala', 'local', 'location', 'localizacao', 'room'],
  discipline: ['disciplina', 'uc', 'unidade curricular', 'cadeira', 'discipline', 'course', 'curso'],
  recurrence: ['recorrencia', 'repeticao', 'repetir', 'recurrence', 'frequencia'],
  description: ['descricao', 'notas', 'observacoes', 'description', 'notes'],
};

function autoMap(headers: string[]): Record<string, CsvField> {
  const mapping: Record<string, CsvField> = {};
  const used = new Set<CsvField>();
  for (const header of headers) {
    const n = normalize(header);
    const field = (Object.entries(SYNONYMS) as [CsvField, string[]][]).find(
      ([f, names]) => !used.has(f) && names.includes(n),
    )?.[0];
    mapping[header] = field ?? 'ignore';
    if (field) used.add(field);
  }
  return mapping;
}

function detectDelimiter(firstLine: string): string {
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

const WEEKDAYS: Record<string, number> = {
  segunda: 1,
  'segunda feira': 1,
  seg: 1,
  '2a': 1,
  monday: 1,
  mon: 1,
  terca: 2,
  'terca feira': 2,
  ter: 2,
  '3a': 2,
  tuesday: 2,
  tue: 2,
  quarta: 3,
  'quarta feira': 3,
  qua: 3,
  '4a': 3,
  wednesday: 3,
  wed: 3,
  quinta: 4,
  'quinta feira': 4,
  qui: 4,
  '5a': 4,
  thursday: 4,
  thu: 4,
  sexta: 5,
  'sexta feira': 5,
  sex: 5,
  '6a': 5,
  friday: 5,
  fri: 5,
  sabado: 6,
  sab: 6,
  saturday: 6,
  sat: 6,
  domingo: 7,
  dom: 7,
  sunday: 7,
  sun: 7,
};

function parseWeekday(value: string): number | null {
  const n = normalize(value).replace(/ /g, ' ');
  if (/^[1-7]$/.test(n)) return Number(n);
  return WEEKDAYS[n] ?? WEEKDAYS[n.replace(' ', '')] ?? null;
}

function parseTime(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2})\s*[:hH.]\s*(\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  return h <= 23 && m <= 59 ? { h, m } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDay(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? `${y}-${pad(m)}-${pad(d)}`
    : null;
}

/** Converte uma data para aaaa-mm-dd. Devolve também se a forma dd/mm vs mm/dd é ambígua. */
function parseDate(value: string, format: DateFormat): { day: string | null; ambiguous: boolean } {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (iso) return { day: validDay(Number(iso[1]), Number(iso[2]), Number(iso[3])), ambiguous: false };
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (!parts) return { day: null, ambiguous: false };
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  const y = Number(parts[3]);
  const ambiguous = a <= 12 && b <= 12 && a !== b;
  const day = format === 'MDY' ? validDay(y, a, b) : validDay(y, b, a);
  return { day, ambiguous };
}

const RECURRING_VALUES = new Set(['semanal', 'semanalmente', 'weekly', 'sim', 's', 'yes', 'todas as semanas']);

export function parseCsv(
  content: string,
  options: CsvOptions,
  defaultTz: string,
  disciplines: DisciplineRef[],
): { items: RawImportItem[]; warnings: string[]; csv: CsvPreviewOptions } {
  const body = content.replace(/^\uFEFF/, '');
  if (body.includes('\u0000')) throw new CsvParseError('O ficheiro não é texto CSV');
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';

  let rows: string[][];
  try {
    rows = parseCsvText(body, {
      delimiter: detectDelimiter(firstLine),
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      to: MAX_ROWS + 2,
    }) as string[][];
  } catch {
    throw new CsvParseError('Não foi possível ler o CSV: verifica o separador e as aspas');
  }
  if (rows.length < 2)
    throw new CsvParseError('O CSV precisa de uma linha de cabeçalho e pelo menos uma linha de dados');
  if (rows.length > MAX_ROWS + 1) throw new CsvParseError(`O CSV tem demasiadas linhas (máximo ${MAX_ROWS})`);

  const headers = rows[0]!.map((h, i) => h || `Coluna ${i + 1}`);
  const mapping = { ...autoMap(headers), ...(options.mapping ?? {}) };
  for (const key of Object.keys(mapping)) if (!headers.includes(key)) delete mapping[key];
  const column = (field: CsvField) => headers.findIndex((h) => mapping[h] === field);
  const has = (field: CsvField) => column(field) >= 0;

  const missingFields: CsvField[] = [];
  if (!has('title') && !has('discipline')) missingFields.push('title');
  if (!has('date') && !has('weekday')) missingFields.push('date');
  if (!has('startTime')) missingFields.push('startTime');
  if (!has('endTime')) missingFields.push('endTime');

  const dateFormat = options.dateFormat ?? 'DMY';
  const validFrom = options.validFrom ?? null;
  const validUntil = options.validUntil ?? null;
  const items: RawImportItem[] = [];
  let ambiguousCount = 0;

  if (missingFields.length === 0) {
    for (const row of rows.slice(1)) {
      const cell = (field: CsvField) => {
        const idx = column(field);
        return idx >= 0 ? (row[idx] ?? '').trim() : '';
      };
      const issues: ImportIssue[] = [];

      const disciplineText = cell('discipline');
      const discipline = disciplineText
        ? disciplines.find(
            (d) => normalize(d.code) === normalize(disciplineText) || normalize(d.name) === normalize(disciplineText),
          )
        : undefined;
      if (disciplineText && !discipline) {
        issues.push({
          field: 'disciplineId',
          severity: 'warning',
          message: `Disciplina «${disciplineText}» não encontrada; escolhe uma ou fica sem disciplina`,
        });
      }
      const title = (cell('title') || disciplineText).slice(0, 200);
      if (!title) issues.push({ field: 'title', severity: 'error', message: 'Linha sem título' });

      const start = parseTime(cell('startTime'));
      const end = parseTime(cell('endTime'));
      if (!start) issues.push({ field: 'startAt', severity: 'error', message: 'Hora de início em falta ou inválida' });
      if (!end) issues.push({ field: 'endAt', severity: 'error', message: 'Hora de fim em falta ou inválida' });

      // Dia: data concreta, ou dia da semana dentro do período das aulas.
      let firstDay: string | null = null;
      const dateText = cell('date');
      const weekdayText = cell('weekday');
      const recurrenceText = normalize(cell('recurrence'));
      let weekly = recurrenceText ? RECURRING_VALUES.has(recurrenceText) : false;

      if (dateText) {
        const parsed = parseDate(dateText, dateFormat);
        if (!parsed.day) issues.push({ field: 'startAt', severity: 'error', message: `Data inválida: «${dateText}»` });
        if (parsed.ambiguous && !options.dateFormat) {
          ambiguousCount++;
          issues.push({
            field: 'startAt',
            severity: 'warning',
            message: `Data ambígua «${dateText}»: confirma se é dia/mês ou mês/dia`,
          });
        }
        firstDay = parsed.day;
      } else if (weekdayText) {
        const weekday = parseWeekday(weekdayText);
        if (!weekday) {
          issues.push({ field: 'startAt', severity: 'error', message: `Dia da semana inválido: «${weekdayText}»` });
        } else if (!validFrom || !validUntil) {
          issues.push({
            field: 'startAt',
            severity: 'error',
            message: 'Indica o período das aulas (de/até) para criar as aulas semanais',
          });
        } else {
          weekly = true;
          const offset = (weekday - weekdayOfKey(validFrom) + 7) % 7;
          firstDay = addDaysToKey(validFrom, offset);
        }
      } else {
        issues.push({ field: 'startAt', severity: 'error', message: 'Linha sem data nem dia da semana' });
      }

      let startAt: Date | null = null;
      let endAt: Date | null = null;
      if (firstDay && start && end) {
        const [y, m, d] = firstDay.split('-').map(Number) as [number, number, number];
        startAt = zonedToInstant(y, m, d, start.h, start.m, defaultTz);
        endAt = zonedToInstant(y, m, d, end.h, end.m, defaultTz);
        if (endAt <= startAt) {
          issues.push({ field: 'endAt', severity: 'error', message: 'A hora de fim tem de ser depois da de início' });
        }
      }

      let recurrenceRule: string | null = null;
      let seriesEndAt: Date | null = endAt;
      let recurrenceSummary: string | null = null;
      if (weekly && startAt && endAt) {
        if (!validUntil) {
          issues.push({
            field: 'recurrenceRule',
            severity: 'error',
            message: 'Indica até quando se repetem as aulas semanais',
          });
        } else {
          recurrenceRule = weeklyUntilRule(validUntil, defaultTz);
          const series = { startAt, endAt, timezone: defaultTz, recurrenceRule, exceptionDates: [] };
          seriesEndAt = computeSeriesEnd(series);
          recurrenceSummary = describeRecurrence(recurrenceRule, seriesEndAt, defaultTz, startAt);
        }
      }

      items.push({
        target: 'block',
        title,
        kind: recurrenceRule ? 'CLASS' : 'EVENT',
        startAt: startAt?.toISOString() ?? null,
        endAt: endAt?.toISOString() ?? null,
        allDay: false,
        timezone: defaultTz,
        location: cell('location').slice(0, 200) || null,
        description: cell('description').slice(0, 2000) || null,
        recurrenceRule,
        recurrenceSummary,
        exceptionDates: [],
        seriesEndAt: seriesEndAt?.toISOString() ?? null,
        externalId: null,
        isBusy: true,
        disciplineId: discipline?.id ?? null,
        disciplineLabel: disciplineText || null,
        issues,
      });
    }
  }

  const warnings: string[] = [];
  if (missingFields.length > 0) {
    warnings.push('Associa as colunas do ficheiro aos campos obrigatórios para ver a pré-visualização');
  }
  if (ambiguousCount > 0) {
    warnings.push(`${ambiguousCount} data(s) ambígua(s): escolhe o formato das datas antes de confirmar`);
  }

  return {
    items,
    warnings,
    csv: {
      headers,
      mapping,
      dateFormat,
      dateFormatAmbiguous: ambiguousCount > 0,
      validFrom,
      validUntil,
      missingFields,
    },
  };
}
