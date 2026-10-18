import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/lib/imports/csv.js';
import { IcsParseError, parseIcs } from '../src/lib/imports/ics.js';
import {
  computeSeriesEnd,
  describeRecurrence,
  expandOccurrences,
  validateRecurrenceRule,
  weeklyUntilRule,
} from '../src/lib/recurrence.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const TZ = 'Europe/Lisbon';

// Segunda-feira 19/10/2026, 10:00–12:00 em Lisboa (hora de verão, UTC+1)
const weekly = {
  startAt: new Date('2026-10-19T09:00:00Z'),
  endAt: new Date('2026-10-19T11:00:00Z'),
  timezone: TZ,
  recurrenceRule: weeklyUntilRule('2026-11-16', TZ),
  exceptionDates: [] as Date[],
};

describe('recorrências', () => {
  it('mantém a hora local depois do fim da hora de verão (25/10/2026)', () => {
    const occ = expandOccurrences(weekly, new Date('2026-10-01'), new Date('2026-12-31'));
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      '2026-10-19T09:00:00.000Z', // 10:00 WEST
      '2026-10-26T10:00:00.000Z', // 10:00 WET
      '2026-11-02T10:00:00.000Z',
      '2026-11-09T10:00:00.000Z',
      '2026-11-16T10:00:00.000Z',
    ]);
  });

  it('gera só as ocorrências do intervalo pedido e respeita exceções', () => {
    const occ = expandOccurrences(
      { ...weekly, exceptionDates: [new Date('2026-11-02T10:00:00Z')] },
      new Date('2026-10-27'),
      new Date('2026-11-10'),
    );
    expect(occ.map((o) => o.start.toISOString())).toEqual(['2026-11-09T10:00:00.000Z']);
  });

  it('calcula o fim da série e descreve-a em português', () => {
    const end = computeSeriesEnd(weekly);
    expect(end?.toISOString()).toBe('2026-11-16T12:00:00.000Z');
    expect(describeRecurrence(weekly.recurrenceRule, end, TZ, weekly.startAt)).toBe('Semanal (seg) até 16/11/2026');
    expect(computeSeriesEnd({ ...weekly, recurrenceRule: 'FREQ=WEEKLY' })).toBeNull();
  });

  it('rejeita regras não suportadas ou demasiado frequentes', () => {
    expect(validateRecurrenceRule('FREQ=MINUTELY', weekly)).toMatch(/não suportada/);
    expect(validateRecurrenceRule('FREQ=HOURLY', weekly)).toMatch(/não suportada/);
    expect(validateRecurrenceRule('isto não é uma regra', weekly)).not.toBeNull();
    expect(validateRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,WE', weekly)).toBeNull();
  });
});

describe('parser ICS', () => {
  it('converte o fuso do Outlook, exceções e ocorrências alteradas', () => {
    const { items, warnings } = parseIcs(fixture('outlook.ics'), TZ);
    expect(warnings).toContain('1 evento(s) cancelado(s) no ficheiro foram ignorados');
    const series = items.find((i) => i.recurrenceRule)!;
    expect(series.startAt).toBe('2026-10-19T09:00:00.000Z');
    expect(series.timezone).toBe(TZ);
    expect(series.recurrenceSummary).toBe('Semanal (seg) até 30/11/2026');
    expect(series.exceptionDates).toEqual(['2026-11-02T10:00:00.000Z', '2026-11-09T10:00:00.000Z']);
    const moved = items.find((i) => i.externalId?.includes('#'))!;
    expect(moved.startAt).toBe('2026-11-09T14:00:00.000Z');
    expect(moved.location).toBe('Auditório');
  });

  it('eventos de dia inteiro não bloqueiam o planeamento por omissão', () => {
    const allDay = parseIcs(fixture('outlook.ics'), TZ).items.find((i) => i.allDay)!;
    expect(allDay.isBusy).toBe(false);
    expect(allDay.startAt).toBe('2026-11-03T00:00:00.000Z');
    expect(allDay.issues[0]?.severity).toBe('warning');
  });

  it('prazos sem duração do Moodle passam a tarefas, com a disciplina da categoria', () => {
    const { items } = parseIcs(fixture('moodle.ics'), TZ);
    expect(items[0]).toMatchObject({ target: 'task', disciplineLabel: 'BD', isBusy: false });
    expect(items[1]).toMatchObject({ target: 'block', title: 'Teste de Matemática' });
  });

  it('recusa ficheiros que não são iCalendar', () => {
    expect(() => parseIcs('isto não é um calendário', TZ)).toThrow(IcsParseError);
    expect(() => parseIcs('BEGIN:VCARD\r\nEND:VCARD', TZ)).toThrow(IcsParseError);
  });

  it('recusa recorrências abusivas sem as expandir', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:spam',
      'SUMMARY:Spam',
      'DTSTART:20261019T090000Z',
      'DTEND:20261019T100000Z',
      'RRULE:FREQ=MINUTELY',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [item] = parseIcs(ics, TZ).items;
    expect(item!.recurrenceRule).toBeNull();
    expect(item!.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('parser CSV', () => {
  const disciplines = [
    { id: 1, code: 'PW', name: 'Programação Web' },
    { id: 2, code: 'BD', name: 'Bases de Dados' },
  ];

  it('mapeia cabeçalhos em português e separador ;', () => {
    const { csv, items } = parseCsv(fixture('horario.csv'), {}, TZ, disciplines);
    expect(csv.mapping).toEqual({
      UC: 'discipline',
      Dia: 'weekday',
      Início: 'startTime',
      Fim: 'endTime',
      Sala: 'location',
    });
    // Sem período das aulas não cria séries semanais nem inventa datas
    expect(items.every((i) => i.startAt === null && i.issues.some((x) => x.severity === 'error'))).toBe(true);
  });

  it('cria aulas semanais dentro do período indicado', () => {
    const { items } = parseCsv(
      fixture('horario.csv'),
      { validFrom: '2026-10-19', validUntil: '2026-12-18' },
      TZ,
      disciplines,
    );
    expect(items.map((i) => [i.title, i.startAt, i.disciplineId])).toEqual([
      ['PW', '2026-10-19T09:00:00.000Z', 1],
      ['BD', '2026-10-21T13:30:00.000Z', 2],
      ['Inglês Técnico', '2026-10-23T08:00:00.000Z', null],
    ]);
    expect(items[0]!.recurrenceSummary).toBe('Semanal (seg) até 14/12/2026');
  });

  it('assinala datas ambíguas e não preenche horas em falta', () => {
    const { csv, items, warnings } = parseCsv(fixture('eventos.csv'), {}, TZ, disciplines);
    expect(csv.dateFormatAmbiguous).toBe(true);
    expect(warnings.join(' ')).toMatch(/ambígua/);
    const workshop = items.find((i) => i.title === 'Workshop')!;
    expect(workshop.endAt).toBeNull();
    expect(workshop.issues).toContainEqual(expect.objectContaining({ field: 'endAt', severity: 'error' }));
  });

  it('com formato mês/dia escolhido, interpreta 05/11 como 11 de maio', () => {
    const { items, csv } = parseCsv(fixture('eventos.csv'), { dateFormat: 'MDY' }, TZ, disciplines);
    expect(csv.dateFormatAmbiguous).toBe(false);
    expect(items[0]!.startAt).toBe('2026-05-11T17:00:00.000Z');
  });

  it('indica os campos obrigatórios por mapear', () => {
    const { csv, items } = parseCsv('a,b\n1,2', {}, TZ, disciplines);
    expect(csv.missingFields).toEqual(['title', 'date', 'startTime', 'endTime']);
    expect(items).toHaveLength(0);
  });
});
