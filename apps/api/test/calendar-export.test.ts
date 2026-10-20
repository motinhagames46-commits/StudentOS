// GET /api/me/calendar.ics — exportação do plano para o calendário pessoal (RFC 5545).
// O ficheiro é lido com o ical.js, um leitor independente do gerador, para validar o formato e o fuso.
import ICAL from 'ical.js';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { escapeText, foldLine } from '../src/lib/ics-export.js';
import { prisma } from '../src/lib/prisma.js';
import { createUserAndLogin, resetDb } from './helpers.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Datas sempre no futuro, seja qual for o ano em que os testes correm.
const NEXT_YEAR = new Date().getUTCFullYear() + 1;

let alice: string[];
let aliceId: number;
let aliceDisciplineId: number;
let bob: string[];
let bobId: number;
let bobDisciplineId: number;

beforeEach(async () => {
  await resetDb();
  ({
    cookie: alice,
    user: { id: aliceId },
    disciplineId: aliceDisciplineId,
  } = await createUserAndLogin('alice'));
  ({
    cookie: bob,
    user: { id: bobId },
    disciplineId: bobDisciplineId,
  } = await createUserAndLogin('bob'));
});

async function exportCalendar(cookie: string[]) {
  const res = await request(app).get('/api/me/calendar.ics').set('Cookie', cookie).buffer(true);
  return { res, text: res.text };
}

function parse(text: string) {
  const root = new ICAL.Component(ICAL.parse(text));
  ICAL.TimezoneService.register(root.getFirstSubcomponent('vtimezone')!);
  const events = root.getAllSubcomponents('vevent');
  const byUid = new Map(events.map((e) => [e.getFirstPropertyValue('uid') as string, e]));
  return { root, events, byUid };
}

const plannedSession = (userId: number, start: Date, minutes: number, extra: object = {}) =>
  prisma.plannedSession.create({
    data: {
      userId,
      startAt: start,
      endAt: new Date(start.getTime() + minutes * 60 * 1000),
      plannedMinutes: minutes,
      reason: 'Teste',
      ...extra,
    },
  });

async function createTask(cookie: string[], body: object) {
  const res = await request(app).post('/api/tasks').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

async function createAssessment(cookie: string[], disciplineId: number, body: object) {
  const res = await request(app).post(`/api/disciplines/${disciplineId}/assessments`).set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

describe('GET /api/me/calendar.ics', () => {
  it('exige sessão iniciada (401)', async () => {
    const res = await request(app).get('/api/me/calendar.ics');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('descarrega um ficheiro iCalendar válido: CRLF, linhas ≤ 75 octetos, VTIMEZONE e cabeçalhos', async () => {
    await createTask(alice, {
      title: `Relatório; parte 1, versão \\ final — ${'ação '.repeat(20)}`,
      dueDate: new Date(Date.now() + 3 * DAY).toISOString(),
      disciplineId: aliceDisciplineId,
    });
    const { res, text } = await exportCalendar(alice);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="studentos-calendario-\d{4}-\d{2}-\d{2}\.ics"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');

    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/); // nenhuma mudança de linha sem CR
    const lines = text.slice(0, -2).split('\r\n');
    for (const line of lines) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true); // o título longo foi dobrado

    const { root, events } = parse(text);
    expect(root.getFirstPropertyValue('prodid')).toBe('-//StudentOS//Plano de estudo//PT');
    expect(root.getFirstSubcomponent('vtimezone')!.getFirstPropertyValue('tzid')).toBe('Europe/Lisbon');
    expect(events).toHaveLength(1);
    // O escape e a dobra são desfeitos pelo leitor: o título chega intacto
    expect(events[0]!.getFirstPropertyValue('summary')).toBe(
      `Prazo · PW · Relatório; parte 1, versão \\ final — ${'ação '.repeat(20)}`.trimEnd(),
    );
  });

  it('inclui sessões futuras (sem as retiradas), avaliações com data e prazos por fazer, cada um com lembrete', async () => {
    const soon = new Date(Date.now() + 2 * DAY);
    const task = await createTask(alice, {
      title: 'Resumo',
      dueDate: soon.toISOString(),
      disciplineId: aliceDisciplineId,
    });
    const done = await createTask(alice, { title: 'Já feita', dueDate: soon.toISOString() });
    await request(app).patch(`/api/tasks/${done.id}`).set('Cookie', alice).send({ status: 'DONE' }).expect(200);
    await createTask(alice, { title: 'Sem prazo' });
    await createTask(alice, { title: 'Prazo passado', dueDate: new Date(Date.now() - 3 * DAY).toISOString() });
    const exam = await createAssessment(alice, aliceDisciplineId, {
      name: 'Exame',
      type: 'EXAM',
      weight: 40,
      date: new Date(Date.now() + 10 * DAY).toISOString(),
    });
    await createAssessment(alice, aliceDisciplineId, { name: 'Sem data', weight: 10 });
    const planned = await plannedSession(aliceId, new Date(Date.now() + DAY), 50, {
      taskId: task.id,
      disciplineId: aliceDisciplineId,
    });
    await plannedSession(aliceId, new Date(Date.now() + DAY + 2 * HOUR), 50, { status: 'CANCELLED' });
    await plannedSession(aliceId, new Date(Date.now() - DAY), 50, { status: 'COMPLETED' });

    const { text } = await exportCalendar(alice);
    const { events, byUid } = parse(text);

    expect([...byUid.keys()].sort()).toEqual(
      [
        `assessment-${exam.id}@studentos`,
        `planned-session-${planned.id}@studentos`,
        `task-${task.id}@studentos`,
      ].sort(),
    );
    expect(byUid.get(`planned-session-${planned.id}@studentos`)!.getFirstPropertyValue('summary')).toBe(
      'Estudar · PW · Resumo',
    );
    expect(byUid.get(`assessment-${exam.id}@studentos`)!.getFirstPropertyValue('summary')).toBe(
      'Avaliação · PW · Exame',
    );
    expect(byUid.get(`assessment-${exam.id}@studentos`)!.getFirstPropertyValue('description')).toBe(
      'Programação Web · vale 40% da nota',
    );

    for (const event of events) {
      expect(event.getFirstPropertyValue('dtstamp')).toBeTruthy();
      const alarm = event.getFirstSubcomponent('valarm');
      expect(alarm?.getFirstPropertyValue('action')).toBe('DISPLAY');
      expect(alarm?.getFirstPropertyValue('description')).toBe(event.getFirstPropertyValue('summary'));
    }
    const trigger = (uid: string) =>
      String(byUid.get(uid)!.getFirstSubcomponent('valarm')!.getFirstPropertyValue('trigger'));
    expect(trigger(`planned-session-${planned.id}@studentos`)).toBe('-PT30M');
    expect(trigger(`task-${task.id}@studentos`)).toBe('-PT15H');

    // UID estável: exportar outra vez dá os mesmos identificadores (reimportar atualiza, não duplica)
    const again = parse((await exportCalendar(alice)).text);
    expect([...again.byUid.keys()].sort()).toEqual([...byUid.keys()].sort());
  });

  it('só exporta os dados do próprio utilizador', async () => {
    const day = new Date(Date.now() + 2 * DAY).toISOString();
    await createTask(bob, { title: 'Segredo do Bob', dueDate: day });
    await createAssessment(bob, bobDisciplineId, { name: 'Exame do Bob', weight: 50, date: day });
    await plannedSession(bobId, new Date(Date.now() + DAY), 50, { disciplineId: bobDisciplineId });
    const mine = await createTask(alice, { title: 'Tarefa da Alice', dueDate: day });

    const { text } = await exportCalendar(alice);
    expect(text).not.toMatch(/Bob/);
    expect([...parse(text).byUid.keys()]).toEqual([`task-${mine.id}@studentos`]);

    const bobEvents = parse((await exportCalendar(bob)).text).events;
    expect(bobEvents).toHaveLength(3);
    expect(bobEvents.map((e) => e.getFirstPropertyValue('summary')).join('\n')).not.toMatch(/Alice/);
  });

  it('usa o fuso Europe/Lisbon: hora de verão e de inverno, e o dia civil de Lisboa nos dias inteiros', async () => {
    // Instante UTC → hora local esperada. A hora de verão (WEST, +1) começa no último domingo de março
    // (25–31) e acaba no último domingo de outubro (25–31): os dias 24 e 31 ficam sempre de lados opostos.
    const cases = [
      { utc: `${NEXT_YEAR}-01-15T13:00:00Z`, local: `${NEXT_YEAR}0115T130000`, end: `${NEXT_YEAR}0115T135000` },
      { utc: `${NEXT_YEAR}-03-24T12:00:00Z`, local: `${NEXT_YEAR}0324T120000`, end: `${NEXT_YEAR}0324T125000` },
      { utc: `${NEXT_YEAR}-03-31T12:00:00Z`, local: `${NEXT_YEAR}0331T130000`, end: `${NEXT_YEAR}0331T135000` },
      { utc: `${NEXT_YEAR}-07-15T13:00:00Z`, local: `${NEXT_YEAR}0715T140000`, end: `${NEXT_YEAR}0715T145000` },
      { utc: `${NEXT_YEAR}-10-24T12:00:00Z`, local: `${NEXT_YEAR}1024T130000`, end: `${NEXT_YEAR}1024T135000` },
      { utc: `${NEXT_YEAR}-10-31T12:00:00Z`, local: `${NEXT_YEAR}1031T120000`, end: `${NEXT_YEAR}1031T125000` },
    ];
    const sessions: { id: number }[] = [];
    for (const c of cases) sessions.push(await plannedSession(aliceId, new Date(c.utc), 50));
    // 23:30 UTC de 31/03 é já 00:30 de 01/04 em Lisboa (verão); em dezembro continua a ser dia 31
    const april = await createTask(alice, { title: 'Abril', dueDate: `${NEXT_YEAR}-03-31T23:30:00.000Z` });
    const december = await createTask(alice, { title: 'Dezembro', dueDate: `${NEXT_YEAR}-12-31T23:30:00.000Z` });

    const { text } = await exportCalendar(alice);
    const { byUid } = parse(text);
    cases.forEach((c, i) => {
      expect(text).toContain(`DTSTART;TZID=Europe/Lisbon:${c.local}\r\n`);
      expect(text).toContain(`DTEND;TZID=Europe/Lisbon:${c.end}\r\n`);
      // O leitor converte a hora local com as regras do VTIMEZONE do ficheiro e chega ao mesmo instante
      const dtstart = byUid.get(`planned-session-${sessions[i]!.id}@studentos`)!.getFirstPropertyValue('dtstart');
      expect((dtstart as ICAL.Time).toJSDate().toISOString()).toBe(new Date(c.utc).toISOString());
    });

    const allDay = (uid: string) => {
      const event = byUid.get(uid)!;
      const dtstart = event.getFirstPropertyValue('dtstart') as ICAL.Time;
      const dtend = event.getFirstPropertyValue('dtend') as ICAL.Time;
      return { isDate: dtstart.isDate, start: dtstart.toString(), end: dtend.toString() };
    };
    expect(allDay(`task-${april.id}@studentos`)).toEqual({
      isDate: true,
      start: `${NEXT_YEAR}-04-01`,
      end: `${NEXT_YEAR}-04-02`,
    });
    expect(allDay(`task-${december.id}@studentos`)).toEqual({
      isDate: true,
      start: `${NEXT_YEAR}-12-31`,
      end: `${NEXT_YEAR + 1}-01-01`,
    });
  });

  it('sem dados devolve um calendário válido e vazio', async () => {
    const { res, text } = await exportCalendar(alice);
    expect(res.status).toBe(200);
    expect(parse(text).events).toHaveLength(0);
  });
});

describe('escape e dobra de linhas (RFC 5545)', () => {
  it('escapa barra invertida, ponto e vírgula, vírgula e mudanças de linha; retira caracteres de controlo', () => {
    expect(escapeText('a\\b;c,d\r\ne\nf\u0007g')).toBe('a\\\\b\\;c\\,d\\ne\\nfg');
  });

  it('dobra em blocos de 75 octetos sem partir caracteres de vários bytes', () => {
    const line = `SUMMARY:${'ç'.repeat(100)}`;
    const folded = foldLine(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(folded.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
    expect(foldLine('SUMMARY:curto')).toBe('SUMMARY:curto');
  });
});
