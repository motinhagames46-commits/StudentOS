import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { DEFAULT_TIMEZONE, addDaysToKey, zonedDayKey } from '@studentos/shared';
import { createUserAndLogin, resetDb } from './helpers.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
// Planos que começam amanhã: o resultado não depende da hora a que os testes correm.
const tomorrow = () => addDaysToKey(zonedDayKey(new Date(), DEFAULT_TIMEZONE), 1);

// Todos os dias, 08:00–22:00 (hora de Lisboa): espaço de sobra para os testes.
const everyDay = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
const prefs = { sessionMinutes: 50, minSessionMinutes: 25, breakMinutes: 10, maxDailyMinutes: 180 };

let ines: string[];
let rui: string[];
let inesUserId: number;
let disciplineId: number;

beforeEach(async () => {
  await resetDb();
  ({
    cookie: ines,
    disciplineId,
    user: { id: inesUserId },
  } = await createUserAndLogin('ines'));
  ({ cookie: rui } = await createUserAndLogin('rui'));
});

const setAvailability = (cookie: string[], availability = everyDay) =>
  request(app)
    .put('/api/preferences/study')
    .set('Cookie', cookie)
    .send({ ...prefs, availability });

const createTask = (cookie: string[], body: object) =>
  request(app)
    .post('/api/tasks')
    .set('Cookie', cookie)
    .send({ title: 'Relatório', disciplineId, ...body });

const preview = (cookie: string[], body: object = {}) =>
  request(app).post('/api/planner/preview').set('Cookie', cookie).send(body);

describe('preferências de estudo', () => {
  it('cria valores por omissão documentados e guarda a disponibilidade', async () => {
    const initial = await request(app).get('/api/preferences/study').set('Cookie', ines);
    expect(initial.body).toEqual({ ...prefs, availability: [] });
    const saved = await setAvailability(ines);
    expect(saved.status).toBe(200);
    expect(saved.body.availability).toHaveLength(7);
    expect((await request(app).get('/api/preferences/study').set('Cookie', rui)).body.availability).toEqual([]);
  });

  it('recusa períodos sobrepostos ou impossíveis', async () => {
    const overlapping = await setAvailability(ines, [
      { weekday: 1, startMinute: 600, endMinute: 720 },
      { weekday: 1, startMinute: 700, endMinute: 800 },
    ]);
    expect(overlapping.status).toBe(400);
    const backwards = await setAvailability(ines, [{ weekday: 2, startMinute: 900, endMinute: 800 }]);
    expect(backwards.status).toBe(400);
  });
});

describe('pré-visualização (spec §11.6)', () => {
  it('sem disponibilidade, avisa e não inventa sessões', async () => {
    await createTask(ines, { estimatedMinutes: 120, dueDate: iso(3 * DAY) });
    const res = await preview(ines);
    expect(res.status).toBe(201);
    expect(res.body.proposal.sessions).toEqual([]);
    expect(res.body.proposal.warnings.join(' ')).toMatch(/disponibilidade/);
    expect(res.body.proposal.unplanned[0]).toMatchObject({ reason: 'NO_SPACE', missingMinutes: 120 });
  });

  it('propõe sessões sem gravar nada e explica cada uma', async () => {
    await setAvailability(ines);
    await createTask(ines, { estimatedMinutes: 120, dueDate: iso(3 * DAY) });
    const res = await preview(ines);
    const sessions = res.body.proposal.sessions;
    expect(sessions.reduce((s: number, x: { minutes: number }) => s + x.minutes, 0)).toBe(120);
    expect(sessions[0].reason).toMatch(/Tarefa «Relatório» \(PW\).*faltam cerca de 120 min/);
    expect(await prisma.plannedSession.count()).toBe(0);
  });

  it('pede a duração quando a tarefa não tem estimativa', async () => {
    await setAvailability(ines);
    await createTask(ines, { title: 'Sem estimativa' });
    const res = await preview(ines);
    expect(res.body.proposal.unplanned).toContainEqual(
      expect.objectContaining({ reason: 'NO_ESTIMATE', title: 'Sem estimativa' }),
    );
  });

  it('nunca propõe estudo por cima de aulas ocupadas', async () => {
    await setAvailability(ines);
    await createTask(ines, { estimatedMinutes: 600, dueDate: iso(5 * DAY) });
    // aula ocupada de 3 dias, a começar já: o plano tem de a evitar
    await request(app)
      .post('/api/schedule-blocks')
      .set('Cookie', ines)
      .send({ title: 'Aula longa', startAt: iso(0), endAt: iso(3 * DAY) });
    const { body } = await preview(ines);
    expect(body.proposal.sessions.length).toBeGreaterThan(0);
    for (const s of body.proposal.sessions) {
      expect(new Date(s.start).getTime()).toBeGreaterThanOrEqual(Date.now() + 3 * DAY - 60_000);
    }
  });
});

describe('confirmação e replaneamento', () => {
  async function confirmedPlan() {
    await setAvailability(ines);
    const { body: task } = await createTask(ines, { estimatedMinutes: 150, dueDate: iso(4 * DAY) });
    const { body: plan } = await preview(ines, { from: tomorrow() });
    const res = await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);
    expect(res.status).toBe(200);
    return { task, plan, created: res.body.created as number };
  }

  it('confirma: cria as sessões propostas', async () => {
    const { created } = await confirmedPlan();
    expect(created).toBe(3); // 50 + 50 + 50
    const sessions = await prisma.plannedSession.findMany({ orderBy: { startAt: 'asc' } });
    expect(sessions.every((s) => s.status === 'PLANNED' && s.planId)).toBe(true);
  });

  it('um novo plano substitui só sessões futuras não fixadas, e mostra-as antes', async () => {
    await confirmedPlan();
    const first = await prisma.plannedSession.findFirst({ orderBy: { startAt: 'asc' } });
    await request(app).patch(`/api/planned-sessions/${first!.id}`).set('Cookie', ines).send({ pinned: true });

    const { body: plan } = await preview(ines);
    expect(plan.proposal.removals.map((r: { id: number }) => r.id)).not.toContain(first!.id);
    expect(plan.proposal.removals).toHaveLength(2);
    await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);

    const pinned = await prisma.plannedSession.findUnique({ where: { id: first!.id } });
    expect(pinned).toMatchObject({ status: 'PLANNED', pinned: true });
    // a sessão fixada conta como trabalho reservado: só faltam 100 min para planear
    const active = await prisma.plannedSession.findMany({ where: { status: 'PLANNED', pinned: false } });
    expect(active.reduce((s, x) => s + x.plannedMinutes, 0)).toBe(100);
  });

  it('recusa confirmar uma proposta desatualizada (409) ou expirada (410)', async () => {
    await setAvailability(ines);
    await createTask(ines, { estimatedMinutes: 100, dueDate: iso(3 * DAY) });
    const { body: plan } = await preview(ines);
    const first = plan.proposal.sessions[0];
    await request(app)
      .post('/api/schedule-blocks')
      .set('Cookie', ines)
      .send({ title: 'Reunião nova', kind: 'EVENT', startAt: first.start, endAt: first.end });
    const stale = await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('PLAN_STALE');
    expect(await prisma.plannedSession.count()).toBe(0);

    const { body: next } = await preview(ines);
    await prisma.studyPlan.update({ where: { id: next.id }, data: { createdAt: new Date(Date.now() - 2 * HOUR) } });
    expect((await request(app).post(`/api/planner/${next.id}/confirm`).set('Cookie', ines)).status).toBe(410);
  });

  it('concluir regista minutos reais sem concluir a tarefa; sessões concluídas ficam protegidas', async () => {
    const { task } = await confirmedPlan();
    const past = await prisma.plannedSession.create({
      data: {
        userId: inesUserId,
        startAt: new Date(Date.now() - 2 * HOUR),
        endAt: new Date(Date.now() - HOUR),
        plannedMinutes: 60,
        reason: 'teste',
        taskId: task.id,
      },
    });
    const future = await prisma.plannedSession.findFirst({ where: { startAt: { gt: new Date() } } });
    expect((await request(app).post(`/api/planned-sessions/${future!.id}/complete`).set('Cookie', ines)).status).toBe(
      409,
    );

    const done = await request(app)
      .post(`/api/planned-sessions/${past.id}/complete`)
      .set('Cookie', ines)
      .send({ actualMinutes: 45 });
    expect(done.body).toMatchObject({ status: 'COMPLETED', actualMinutes: 45 });
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.status).toBe('TODO');

    const { body: replan } = await request(app).post('/api/planner/replan').set('Cookie', ines);
    expect(replan.proposal.removals.map((r: { id: number }) => r.id)).not.toContain(past.id);
    // 150 estimados − 45 feitos = 105 por planear
    const total = replan.proposal.sessions.reduce((s: number, x: { minutes: number }) => s + x.minutes, 0);
    expect(total).toBe(105);
  });

  it('falhar uma sessão sugere replanear e a explicação refere a falha', async () => {
    const { task } = await confirmedPlan();
    const future = await prisma.plannedSession.findFirst({ orderBy: { startAt: 'asc' } });
    const notYet = await request(app).post(`/api/planned-sessions/${future!.id}/miss`).set('Cookie', ines);
    expect(notYet.status).toBe(409);
    const first = await prisma.plannedSession.create({
      data: {
        userId: inesUserId,
        startAt: new Date(Date.now() - 3 * HOUR),
        endAt: new Date(Date.now() - 2 * HOUR),
        plannedMinutes: 60,
        reason: 'teste',
        taskId: task.id,
      },
    });
    const missed = await request(app).post(`/api/planned-sessions/${first.id}/miss`).set('Cookie', ines);
    expect(missed.body).toMatchObject({ replanSuggested: true, session: { status: 'MISSED' } });
    const { body: replan } = await request(app).post('/api/planner/replan').set('Cookie', ines);
    expect(replan.proposal.kind).toBe('replan');
    expect(replan.proposal.sessions[0].reason).toMatch(/1 sessão\(ões\) falhada\(s\)/);
  });

  it('mover uma sessão valida conflitos e fixa-a', async () => {
    await confirmedPlan();
    const s = await prisma.plannedSession.findFirst({ orderBy: { startAt: 'asc' } });
    const block = await request(app)
      .post('/api/schedule-blocks')
      .set('Cookie', ines)
      .send({ title: 'Aula', startAt: iso(6 * DAY), endAt: iso(6 * DAY + 2 * HOUR) });
    expect(block.status).toBe(201);
    const conflict = await request(app)
      .patch(`/api/planned-sessions/${s!.id}`)
      .set('Cookie', ines)
      .send({ startAt: iso(6 * DAY + HOUR), endAt: iso(6 * DAY + 2 * HOUR) });
    expect(conflict.status).toBe(409);
    const past = await request(app)
      .patch(`/api/planned-sessions/${s!.id}`)
      .set('Cookie', ines)
      .send({ startAt: iso(-2 * HOUR), endAt: iso(-HOUR) });
    expect(past.status).toBe(400);
    const ok = await request(app)
      .patch(`/api/planned-sessions/${s!.id}`)
      .set('Cookie', ines)
      .send({ startAt: iso(6 * DAY + 3 * HOUR), endAt: iso(6 * DAY + 4 * HOUR) });
    expect(ok.body).toMatchObject({ pinned: true, plannedMinutes: 60 });
  });

  it('retirar cancela sessões planeadas mas não concluídas', async () => {
    await confirmedPlan();
    const s = await prisma.plannedSession.findFirst();
    expect((await request(app).delete(`/api/planned-sessions/${s!.id}`).set('Cookie', ines)).status).toBe(204);
    expect((await prisma.plannedSession.findUnique({ where: { id: s!.id } }))!.status).toBe('CANCELLED');
    const range = `from=${iso(-DAY)}&to=${iso(10 * DAY)}`;
    const list = await request(app).get(`/api/planner/sessions?${range}`).set('Cookie', ines);
    expect(list.body.sessions.map((x: { id: number }) => x.id)).not.toContain(s!.id);
  });
});

describe('isolamento por utilizador', () => {
  it('outro utilizador não confirma o plano nem mexe nas sessões (404)', async () => {
    await setAvailability(ines);
    await createTask(ines, { estimatedMinutes: 60, dueDate: iso(2 * DAY) });
    const { body: plan } = await preview(ines);
    expect((await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', rui)).status).toBe(404);
    await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);
    const s = await prisma.plannedSession.findFirst();
    for (const req of [
      request(app).patch(`/api/planned-sessions/${s!.id}`).set('Cookie', rui).send({ pinned: true }),
      request(app).post(`/api/planned-sessions/${s!.id}/complete`).set('Cookie', rui),
      request(app).post(`/api/planned-sessions/${s!.id}/miss`).set('Cookie', rui),
      request(app).delete(`/api/planned-sessions/${s!.id}`).set('Cookie', rui),
    ]) {
      expect((await req).status).toBe(404);
    }
    const range = `from=${iso(-DAY)}&to=${iso(10 * DAY)}`;
    expect((await request(app).get(`/api/planner/sessions?${range}`).set('Cookie', rui)).body.sessions).toEqual([]);
    // e o plano do Rui não usa as tarefas da Inês
    await setAvailability(rui);
    expect((await preview(rui)).body.proposal.sessions).toEqual([]);
  });

  it('o foco só pode ser ligado a sessões planeadas próprias', async () => {
    await setAvailability(ines);
    await createTask(ines, { estimatedMinutes: 60, dueDate: iso(2 * DAY) });
    const { body: plan } = await preview(ines);
    await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);
    const s = await prisma.plannedSession.findFirst();
    const theirs = await request(app)
      .post('/api/study-sessions/start')
      .set('Cookie', rui)
      .send({ plannedSessionId: s!.id });
    expect(theirs.status).toBe(404);
    const mine = await request(app)
      .post('/api/study-sessions/start')
      .set('Cookie', ines)
      .send({ plannedSessionId: s!.id });
    expect(mine.status).toBe(201);
    expect(mine.body.discipline.code).toBe('PW');
  });
});

describe('sugestão "o que devo estudar agora?" (spec §11.7)', () => {
  it('diz o que falta quando não há estimativas', async () => {
    await createTask(ines, { title: 'Sem duração' });
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body.kind).toBe('missing');
    expect(res.body.message).toMatch(/duração estimada de 1/);
  });

  it('recomenda o item mais prioritário com a explicação', async () => {
    await createTask(ines, { title: 'Longe', estimatedMinutes: 60, dueDate: iso(20 * DAY) });
    await createTask(ines, { title: 'Perto', estimatedMinutes: 60, dueDate: iso(1 * DAY), priority: 'HIGH' });
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body).toMatchObject({ kind: 'item', item: { title: 'Perto' } });
    expect(res.body.message).toMatch(/Prioridade/);
  });
});

it('a exportação inclui preferências, disponibilidade e sessões planeadas', async () => {
  await setAvailability(ines);
  await createTask(ines, { estimatedMinutes: 60, dueDate: iso(2 * DAY) });
  const { body: plan } = await preview(ines);
  await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);
  const res = await request(app).get('/api/me/export').set('Cookie', ines);
  expect(res.body.studyPreferences).toMatchObject(prefs);
  expect(res.body.availabilityRules).toHaveLength(7);
  expect(res.body.plannedSessions.length).toBeGreaterThan(0);
  expect(res.body.studyPlans.length).toBeGreaterThan(0);
});
