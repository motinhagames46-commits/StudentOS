import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createUserAndLogin, resetDb } from './helpers.js';

let alice: string[];
let bob: string[];
let aliceId: number;
let aliceDisciplineId: number;

beforeEach(async () => {
  await resetDb();
  ({
    cookie: alice,
    user: { id: aliceId },
    disciplineId: aliceDisciplineId,
  } = await createUserAndLogin('alice'));
  ({ cookie: bob } = await createUserAndLogin('bob'));
});

const HOUR = 60 * 60 * 1000;
const hoursAgo = (n: number) => new Date(Date.now() - n * HOUR);

describe('POST /api/study-sessions/start', () => {
  it('inicia uma sessão com disciplina (201)', async () => {
    const res = await request(app)
      .post('/api/study-sessions/start')
      .set('Cookie', alice)
      .send({ disciplineId: aliceDisciplineId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ endedAt: null, disciplineId: aliceDisciplineId });
    expect(res.body.discipline.code).toBe('PW');
    expect(Date.now() - new Date(res.body.startedAt).getTime()).toBeLessThan(5000);
  });

  it('inicia uma sessão sem disciplina e sem corpo', async () => {
    const res = await request(app).post('/api/study-sessions/start').set('Cookie', alice);
    expect(res.status).toBe(201);
    expect(res.body.disciplineId).toBeNull();
  });

  it('recusa uma segunda sessão em curso (RN11 — 409)', async () => {
    await request(app).post('/api/study-sessions/start').set('Cookie', alice).send({});
    const res = await request(app).post('/api/study-sessions/start').set('Cookie', alice).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STUDY_SESSION_IN_PROGRESS');
  });

  it('pedidos simultâneos criam só uma sessão (RN11)', async () => {
    const results = await Promise.all(
      [0, 1, 2].map(() => request(app).post('/api/study-sessions/start').set('Cookie', alice).send({})),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.studySession.count({ where: { userId: aliceId, endedAt: null } })).toBe(1);
  });

  it('a sessão em curso de outro utilizador não bloqueia', async () => {
    await request(app).post('/api/study-sessions/start').set('Cookie', alice).send({});
    const res = await request(app).post('/api/study-sessions/start').set('Cookie', bob).send({});
    expect(res.status).toBe(201);
  });

  it('não permite associar a disciplina de outro utilizador (404)', async () => {
    const res = await request(app)
      .post('/api/study-sessions/start')
      .set('Cookie', bob)
      .send({ disciplineId: aliceDisciplineId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DISCIPLINE_NOT_FOUND');
  });

  it('valida o corpo', async () => {
    const res = await request(app)
      .post('/api/study-sessions/start')
      .set('Cookie', alice)
      .send({ disciplineId: 'x', extra: true });
    expect(res.status).toBe(400);
  });

  it('exige sessão iniciada (401)', async () => {
    expect((await request(app).post('/api/study-sessions/start').send({})).status).toBe(401);
    expect((await request(app).get('/api/study-sessions')).status).toBe(401);
  });
});

describe('POST /api/study-sessions/:id/stop', () => {
  it('termina a sessão e permite iniciar outra', async () => {
    const { body: started } = await request(app).post('/api/study-sessions/start').set('Cookie', alice).send({});
    const res = await request(app)
      .post(`/api/study-sessions/${started.id}/stop`)
      .set('Cookie', alice)
      .send({ notes: 'Capítulo 3' });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('Capítulo 3');
    expect(new Date(res.body.endedAt).getTime()).toBeGreaterThan(new Date(started.startedAt).getTime());

    const again = await request(app).post('/api/study-sessions/start').set('Cookie', alice).send({});
    expect(again.status).toBe(201);
  });

  it('recusa terminar uma sessão já terminada (409)', async () => {
    const { body: started } = await request(app).post('/api/study-sessions/start').set('Cookie', alice).send({});
    await request(app).post(`/api/study-sessions/${started.id}/stop`).set('Cookie', alice).send({});
    const res = await request(app).post(`/api/study-sessions/${started.id}/stop`).set('Cookie', alice).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STUDY_SESSION_ALREADY_STOPPED');
  });

  it('outro utilizador não pode terminar a sessão (RN10 — 404)', async () => {
    const { body: started } = await request(app).post('/api/study-sessions/start').set('Cookie', alice).send({});
    const res = await request(app).post(`/api/study-sessions/${started.id}/stop`).set('Cookie', bob).send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STUDY_SESSION_NOT_FOUND');
    const stored = await prisma.studySession.findUniqueOrThrow({ where: { id: started.id } });
    expect(stored.endedAt).toBeNull();
  });

  it('id inválido devolve 400; inexistente devolve 404', async () => {
    expect((await request(app).post('/api/study-sessions/abc/stop').set('Cookie', alice).send({})).status).toBe(400);
    expect((await request(app).post('/api/study-sessions/9999/stop').set('Cookie', alice).send({})).status).toBe(404);
  });
});

describe('GET /api/study-sessions', () => {
  beforeEach(async () => {
    await prisma.studySession.createMany({
      data: [
        { userId: aliceId, startedAt: hoursAgo(72), endedAt: hoursAgo(71) },
        { userId: aliceId, startedAt: hoursAgo(5), endedAt: hoursAgo(4), disciplineId: aliceDisciplineId },
        { userId: aliceId, startedAt: hoursAgo(1), endedAt: null },
      ],
    });
  });

  it('lista só as sessões do próprio utilizador, mais recentes primeiro', async () => {
    const res = await request(app).get('/api/study-sessions').set('Cookie', alice);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].endedAt).toBeNull();
    expect(res.body[1].discipline.code).toBe('PW');
    expect((await request(app).get('/api/study-sessions').set('Cookie', bob)).body).toHaveLength(0);
  });

  it('filtra por intervalo; a sessão em curso entra em qualquer intervalo até agora', async () => {
    const from = hoursAgo(24).toISOString();
    const recent = await request(app).get(`/api/study-sessions?from=${from}`).set('Cookie', alice);
    expect(recent.body).toHaveLength(2);

    const to = hoursAgo(48).toISOString();
    const old = await request(app).get(`/api/study-sessions?to=${to}`).set('Cookie', alice);
    expect(old.body).toHaveLength(1);
  });

  it('valida as datas do filtro', async () => {
    const res = await request(app).get('/api/study-sessions?from=ontem').set('Cookie', alice);
    expect(res.status).toBe(400);
    const reversed = await request(app)
      .get(`/api/study-sessions?from=${hoursAgo(1).toISOString()}&to=${hoursAgo(2).toISOString()}`)
      .set('Cookie', alice);
    expect(reversed.status).toBe(400);
  });
});

describe('modo foco: presets e pausa (spec §7.6)', () => {
  it('guarda o preset, pausa e retoma no servidor e desconta as pausas na duração e nas estatísticas', async () => {
    const { cookie: me } = await createUserAndLogin('foco');
    const { cookie: other } = await createUserAndLogin('outro');
    const start = await request(app)
      .post('/api/study-sessions/start')
      .set('Cookie', me)
      .send({ targetMinutes: 25, breakMinutes: 5 });
    expect(start.body).toMatchObject({ targetMinutes: 25, breakMinutes: 5, pausedSeconds: 0, pausedAt: null });
    const id = start.body.id;

    expect((await request(app).post(`/api/study-sessions/${id}/pause`).set('Cookie', other)).status).toBe(404);
    expect((await request(app).post(`/api/study-sessions/${id}/resume`).set('Cookie', me)).status).toBe(409);
    expect((await request(app).post(`/api/study-sessions/${id}/pause`).set('Cookie', me)).body.pausedAt).not.toBeNull();
    expect((await request(app).post(`/api/study-sessions/${id}/pause`).set('Cookie', me)).status).toBe(409);

    // simular: sessão começou há 60 min e está em pausa há 20 min
    await prisma.studySession.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - 60 * 60_000), pausedAt: new Date(Date.now() - 20 * 60_000) },
    });
    const resumed = await request(app).post(`/api/study-sessions/${id}/resume`).set('Cookie', me);
    expect(resumed.body.pausedAt).toBeNull();
    expect(resumed.body.pausedSeconds).toBeGreaterThanOrEqual(20 * 60 - 2);

    const stopped = await request(app).post(`/api/study-sessions/${id}/stop`).set('Cookie', me).send({});
    expect(stopped.body.endedAt).not.toBeNull();
    const stats = await request(app).get('/api/stats?days=1').set('Cookie', me);
    expect(stats.body.totalMinutes).toBeGreaterThanOrEqual(39);
    expect(stats.body.totalMinutes).toBeLessThanOrEqual(41); // 60 min − 20 min de pausa
  });

  it('terminar durante uma pausa conta a pausa até ao fim', async () => {
    const { cookie: me } = await createUserAndLogin('pausa');
    const { body: s } = await request(app).post('/api/study-sessions/start').set('Cookie', me).send({});
    await prisma.studySession.update({
      where: { id: s.id },
      data: { startedAt: new Date(Date.now() - 30 * 60_000), pausedAt: new Date(Date.now() - 10 * 60_000) },
    });
    const stopped = await request(app).post(`/api/study-sessions/${s.id}/stop`).set('Cookie', me).send({});
    expect(stopped.body.pausedAt).toBeNull();
    expect(stopped.body.pausedSeconds).toBeGreaterThanOrEqual(10 * 60 - 2);
  });
});
