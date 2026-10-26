import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { DEFAULT_TIMEZONE, addDaysToKey, weekdayOfKey, zonedDayKey, zonedToInstant } from '@studentos/shared';
import { createUserAndLogin, registerUser, resetDb } from './helpers.js';

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
  afterEach(() => vi.useRealTimers());

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

  it('confirmar uns minutos depois não falha: as sessões que já começaram ficam de fora', async () => {
    // Disponível o dia todo: a primeira sessão começa daqui a poucos minutos (grelha de 5 min).
    const allDay = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }));
    await setAvailability(ines, allDay);
    await createTask(ines, { estimatedMinutes: 150, dueDate: iso(3 * DAY) });
    const { body: plan } = await preview(ines);
    const sessions = plan.proposal.sessions as { start: string }[];
    expect(sessions.length).toBeGreaterThan(1);

    // O estudante confirma um minuto depois de a primeira sessão começar.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(sessions[0]!.start).getTime() + 60_000 });
    const res = await request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(sessions.length - 1);
  });

  it('dois «Confirmar» ao mesmo tempo criam as sessões uma só vez', async () => {
    await setAvailability(ines);
    await createTask(ines, { estimatedMinutes: 100, dueDate: iso(3 * DAY) });
    const { body: plan } = await preview(ines, { from: tomorrow() });
    const confirm = () => request(app).post(`/api/planner/${plan.id}/confirm`).set('Cookie', ines);
    const results = await Promise.all([confirm(), confirm()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.plannedSession.count()).toBe(plan.proposal.sessions.length);
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
  it('pedidos simultâneos de uma conta nova não falham ao criar as preferências', async () => {
    // O painel pede as sessões e a sugestão ao mesmo tempo; ambos criam as preferências em falta.
    // Várias contas novas em paralelo, para a corrida acontecer de forma reprodutível.
    const users = await Promise.all(['ana', 'bea', 'caio', 'duda', 'edu'].map((name) => registerUser(name)));
    const sessions = `/api/planner/sessions?from=${iso(0)}&to=${iso(DAY)}`;
    const responses = await Promise.all(
      users.flatMap(({ cookie }) =>
        Array.from({ length: 6 }, (_, i) =>
          request(app)
            .get(i % 2 ? '/api/planner/suggestion' : sessions)
            .set('Cookie', cookie),
        ),
      ),
    );
    expect(responses.filter((r) => r.status !== 200).map((r) => r.body)).toEqual([]);
  });

  it('sem trabalho pendente diz o que fazer', async () => {
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body.kind).toBe('missing');
    expect(res.body.message).toMatch(/Não há trabalho pendente/);
  });

  it('não ignora tarefas sem duração estimada: recomenda-as e pede a duração', async () => {
    await createTask(ines, { title: 'Sem duração', dueDate: iso(1 * DAY), priority: 'HIGH' });
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body).toMatchObject({ kind: 'item', needsEstimate: true, item: { title: 'Sem duração' } });
    expect(res.body.message).toMatch(/Indica a duração estimada/);
  });

  it('uma tarefa em atraso e prioritária ganha a uma tarefa média só por ter duração', async () => {
    await createTask(ines, { title: 'Média com duração', estimatedMinutes: 90, dueDate: iso(2 * DAY) });
    await createTask(ines, { title: 'Em atraso', dueDate: iso(-1 * DAY), priority: 'HIGH' });
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body.item.title).toBe('Em atraso');
    expect(res.body.message).toMatch(/o prazo passou/);
  });

  it('recomenda o item mais urgente com a explicação', async () => {
    await createTask(ines, { title: 'Longe', estimatedMinutes: 60, dueDate: iso(20 * DAY) });
    await createTask(ines, { title: 'Perto', estimatedMinutes: 60, dueDate: iso(1 * DAY), priority: 'HIGH' });
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body).toMatchObject({ kind: 'item', item: { title: 'Perto' } });
    expect(res.body.message).toMatch(/^Urgência/);
  });

  it('ignora tarefas de disciplinas arquivadas (mas não as tarefas sem disciplina)', async () => {
    await createTask(ines, { title: 'Arquivada', estimatedMinutes: 60, dueDate: iso(1 * DAY), priority: 'HIGH' });
    await request(app).patch(`/api/disciplines/${disciplineId}`).set('Cookie', ines).send({ archived: true });
    await createTask(ines, { title: 'Pessoal', disciplineId: null, estimatedMinutes: 30, dueDate: iso(5 * DAY) });
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body.item.title).toBe('Pessoal');
  });

  it('durante uma sessão planeada, a explicação é recalculada agora (não o texto guardado no plano)', async () => {
    const { body: t } = await createTask(ines, { title: 'Ficha', estimatedMinutes: 60, dueDate: iso(1 * DAY) });
    await prisma.plannedSession.create({
      data: {
        userId: inesUserId,
        taskId: t.id,
        disciplineId,
        startAt: new Date(Date.now() - 10 * 60_000),
        endAt: new Date(Date.now() + 40 * 60_000),
        plannedMinutes: 50,
        reason: 'Prioridade baixa: texto antigo do plano.',
      },
    });
    await request(app).patch(`/api/tasks/${t.id}`).set('Cookie', ines).send({ priority: 'HIGH' });
    const res = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(res.body.kind).toBe('session');
    expect(res.body.message).not.toMatch(/texto antigo/);
    expect(res.body.message).toMatch(/^Urgência .*«Ficha» \(PW\) é amanhã/);
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

// Queixa real: «não é possível criar plano de estudo automático». A conta tem 6 UC com as avaliações das
// fichas (pesos a 100 %, sem datas nem tempo de estudo) e o horário importado sem ligação às disciplinas.
describe('plano com avaliações sem data nem tempo de estudo (ritmo pelos ECTS)', () => {
  const UCS: { code: string; ects: number; assessments: [string, string, number][] }[] = [
    {
      code: 'TDM',
      ects: 6,
      assessments: [
        ['Frequência 1', 'TEST', 25],
        ['Frequência 2', 'TEST', 25],
        ['Projeto', 'PROJECT', 50],
      ],
    },
    {
      code: 'IT',
      ects: 6,
      assessments: [
        ['Exame', 'EXAM', 60],
        ['Trabalhos práticos', 'ASSIGNMENT', 40],
      ],
    },
    {
      code: 'RDC',
      ects: 6,
      assessments: [
        ['Teste', 'TEST', 50],
        ['Laboratórios', 'ASSIGNMENT', 50],
      ],
    },
    {
      code: 'AEP',
      ects: 3,
      assessments: [
        ['Teste', 'TEST', 70],
        ['Relatório', 'ASSIGNMENT', 30],
      ],
    },
    { code: 'FDSI', ects: 3, assessments: [['Exame', 'EXAM', 100]] },
    {
      code: 'TDE',
      ects: 3,
      assessments: [
        ['Participação', 'OTHER', 10],
        ['Exame', 'EXAM', 90],
      ],
    },
  ];

  async function setupRealAccount(withEcts: boolean) {
    const ids: Record<string, number> = {};
    for (const uc of UCS) {
      const { body: d } = await request(app)
        .post('/api/disciplines')
        .set('Cookie', ines)
        .send({ name: `UC ${uc.code}`, code: uc.code, ...(withEcts ? { ects: uc.ects } : {}) });
      for (const [name, type, weight] of uc.assessments) {
        const { body: a } = await request(app)
          .post(`/api/disciplines/${d.id}/assessments`)
          .set('Cookie', ines)
          .send({ name, type, weight });
        ids[`${uc.code}:${name}`] = a.id;
      }
    }
    // 9 aulas semanais de 2 h desde o início do semestre, sem disciplina associada (como na importação CSV).
    const { body: me } = await request(app).get('/api/me').set('Cookie', ines);
    const startKey = me.activeSemester.startDate.slice(0, 10);
    const untilKey = me.activeSemester.endDate.slice(0, 10);
    for (let i = 0; i < 9; i++) {
      const key = addDaysToKey(startKey, i % 5);
      const [y, m, dd] = key.split('-').map(Number) as [number, number, number];
      const hour = 9 + 2 * Math.floor(i / 5) + (weekdayOfKey(key) % 2);
      const res = await request(app)
        .post('/api/schedule-blocks')
        .set('Cookie', ines)
        .send({
          title: `Aula ${i + 1}`,
          kind: 'CLASS',
          startAt: zonedToInstant(y, m, dd, hour, 0, DEFAULT_TIMEZONE).toISOString(),
          endAt: zonedToInstant(y, m, dd, hour + 2, 0, DEFAULT_TIMEZONE).toISOString(),
          repeatWeeklyUntil: untilKey,
        });
      expect(res.status).toBe(201);
    }
    await setAvailability(ines);
    return { ids, semester: me.activeSemester as { startDate: string; endDate: string } };
  }

  it('gera sessões para todas as avaliações de estudo, dentro do ritmo, sem inventar prazos', async () => {
    const { ids, semester } = await setupRealAccount(true);
    const { body: plan } = await preview(ines);
    const { sessions, unplanned } = plan.proposal as {
      sessions: { itemId: number; type: string; minutes: number; reason: string }[];
      unplanned: { itemId: number; reason: string; message: string }[];
    };
    expect(sessions.length).toBeGreaterThan(0);

    const semesterDays = (Date.parse(semester.endDate) - Date.parse(semester.startDate)) / DAY + 1;
    for (const uc of UCS) {
      for (const [name, type, weight] of uc.assessments) {
        const id = ids[`${uc.code}:${name}`]!;
        const mine = sessions.filter((s) => s.type === 'assessment' && s.itemId === id);
        if (type === 'OTHER') {
          // Participação/assiduidade não pede estudo: fica a pedir o tempo, se precisar.
          expect(mine).toHaveLength(0);
          expect(unplanned.find((u) => u.itemId === id)?.reason).toBe('NO_ESTIMATE');
          continue;
        }
        expect(mine.length, `${uc.code} ${name} sem sessões`).toBeGreaterThan(0);
        // Nunca mais do que o ritmo pelos ECTS (limite superior: sem descontar as aulas) para ~8 dias.
        const bound = Math.ceil(((uc.ects * 25 * 60 * weight) / 100 / semesterDays) * 8);
        expect(mine.reduce((sum, s) => sum + s.minutes, 0)).toBeLessThanOrEqual(bound);
        for (const s of mine) {
          expect(s.reason).toMatch(/ECTS/);
          expect(s.reason).not.toMatch(/daqui a|é amanhã|é hoje/);
        }
      }
    }
    const suggestion = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(suggestion.body.kind).not.toBe('missing');
  });

  it('sem ECTS não inventa: diz o que falta, sem sessões nem «Não há trabalho pendente»', async () => {
    await setupRealAccount(false);
    const { body: plan } = await preview(ines);
    expect(plan.proposal.sessions).toHaveLength(0);
    const messages = plan.proposal.unplanned.map((u: { message: string }) => u.message).join('\n');
    expect(messages).toMatch(/Falta o ECTS de TDM/);
    const suggestion = await request(app).get('/api/planner/suggestion').set('Cookie', ines);
    expect(suggestion.body.message).not.toMatch(/Não há trabalho pendente/);
    expect(suggestion.body.message).toMatch(/ECTS/);
  });

  it('regressão: um tempo de estudo indicado pelo estudante continua a ser usado tal como está', async () => {
    await setAvailability(ines);
    const { body: a } = await request(app)
      .post(`/api/disciplines/${disciplineId}/assessments`)
      .set('Cookie', ines)
      .send({ name: 'Teste escrito', type: 'TEST', weight: 60, prepMinutes: 240 });
    expect(a.prepMinutes).toBe(240);
    const { body: plan } = await preview(ines);
    const mine = plan.proposal.sessions.filter((s: { itemId: number }) => s.itemId === a.id);
    expect(mine.reduce((sum: number, s: { minutes: number }) => sum + s.minutes, 0)).toBe(240);
    expect(mine.every((s: { reason: string }) => !/ECTS/.test(s.reason))).toBe(true);
  });
});
