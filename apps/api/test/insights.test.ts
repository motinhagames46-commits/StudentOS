import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createUserAndLogin, resetDb } from './helpers.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let cookie: string[];
let other: string[];
let userId: number;
let disciplineId: number;

beforeEach(async () => {
  await resetDb();
  ({
    cookie,
    disciplineId,
    user: { id: userId },
  } = await createUserAndLogin('ines'));
  ({ cookie: other } = await createUserAndLogin('rui'));
});

describe('GET /api/stats (RF14)', () => {
  it('soma o tempo de estudo por disciplina, cortado ao intervalo, e conta tarefas', async () => {
    // O intervalo começa à meia-noite (Lisboa) de há 6 dias, ou seja, entre 6 e 7 dias atrás.
    const straddleEnd = new Date(Date.now() - 5.5 * DAY);
    await prisma.studySession.createMany({
      data: [
        // 90 min dentro do intervalo
        {
          userId,
          disciplineId,
          startedAt: new Date(Date.now() - 2 * DAY),
          endedAt: new Date(Date.now() - 2 * DAY + 1.5 * HOUR),
        },
        // começa antes do intervalo: só conta a parte depois do início
        { userId, startedAt: new Date(Date.now() - 8 * DAY), endedAt: straddleEnd },
        // totalmente fora do intervalo
        {
          userId,
          disciplineId,
          startedAt: new Date(Date.now() - 20 * DAY),
          endedAt: new Date(Date.now() - 20 * DAY + HOUR),
        },
      ],
    });
    await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Atrasada', dueDate: iso(-DAY) });
    const { body: t } = await request(app).post('/api/tasks').set('Cookie', cookie).send({ title: 'Feita' });
    await request(app).patch(`/api/tasks/${t.id}`).set('Cookie', cookie).send({ status: 'DONE' });

    const res = await request(app).get('/api/stats?days=7').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const from = Date.parse(res.body.range.from);
    expect(Date.now() - from).toBeGreaterThan(6 * DAY);
    expect(Date.now() - from).toBeLessThanOrEqual(7 * DAY);

    const clipped = Math.round((straddleEnd.getTime() - from) / 60000);
    expect(res.body.studyByDiscipline).toEqual(
      expect.arrayContaining([
        { discipline: expect.objectContaining({ code: 'PW' }), minutes: 90 },
        { discipline: null, minutes: clipped },
      ]),
    );
    expect(res.body.studyByDiscipline).toHaveLength(2);
    expect(res.body.totalMinutes).toBe(90 + clipped);
    expect(res.body.studyByDay).toHaveLength(7);
    expect(res.body.studyByDay.reduce((s: number, d: { minutes: number }) => s + d.minutes, 0)).toBe(90 + clipped);
    expect(res.body.tasks).toEqual({ todo: 1, done: 1, overdue: 1, completedInRange: 1 });
  });

  it('não mistura dados de outros utilizadores', async () => {
    await prisma.studySession.create({
      data: { userId, startedAt: new Date(Date.now() - HOUR), endedAt: new Date() },
    });
    const res = await request(app).get('/api/stats').set('Cookie', other);
    expect(res.body.totalMinutes).toBe(0);
    expect(res.body.studyByDiscipline).toEqual([]);
  });

  it('valida o número de dias', async () => {
    expect((await request(app).get('/api/stats?days=0').set('Cookie', cookie)).status).toBe(400);
    expect((await request(app).get('/api/stats?days=365').set('Cookie', cookie)).status).toBe(400);
  });
});

describe('GET /api/calendar (RF15)', () => {
  it('devolve tarefas e avaliações do intervalo', async () => {
    await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Dentro', dueDate: iso(3 * DAY) });
    await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Fora', dueDate: iso(40 * DAY) });
    await request(app)
      .post(`/api/disciplines/${disciplineId}/assessments`)
      .set('Cookie', cookie)
      .send({ name: 'Teste', weight: 50, date: iso(5 * DAY) });

    const res = await request(app)
      .get(`/api/calendar?from=${iso(0)}&to=${iso(30 * DAY)}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Dentro']);
    expect(res.body.assessments).toHaveLength(1);
    expect(res.body.assessments[0].discipline.code).toBe('PW');

    const theirs = await request(app)
      .get(`/api/calendar?from=${iso(0)}&to=${iso(30 * DAY)}`)
      .set('Cookie', other);
    expect(theirs.body).toEqual({ tasks: [], assessments: [] });
  });

  it('exige intervalo válido de no máximo 62 dias', async () => {
    expect((await request(app).get('/api/calendar').set('Cookie', cookie)).status).toBe(400);
    expect(
      (
        await request(app)
          .get(`/api/calendar?from=${iso(0)}&to=${iso(90 * DAY)}`)
          .set('Cookie', cookie)
      ).status,
    ).toBe(400);
  });
});

describe('GET /api/alerts (RF17)', () => {
  it('lista o que vence nas próximas 48 h', async () => {
    await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Amanhã', dueDate: iso(DAY) });
    await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Daqui a 3 dias', dueDate: iso(3 * DAY) });
    await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Ontem', dueDate: iso(-DAY) });
    await request(app)
      .post(`/api/disciplines/${disciplineId}/assessments`)
      .set('Cookie', cookie)
      .send({ name: 'Exame', weight: 40, date: iso(30 * HOUR) });
    await request(app)
      .post(`/api/disciplines/${disciplineId}/assessments`)
      .set('Cookie', cookie)
      .send({ name: 'Já com nota', weight: 40, date: iso(10 * HOUR), score: 14 });

    const res = await request(app).get('/api/alerts').set('Cookie', cookie);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Amanhã']);
    expect(res.body.assessments.map((a: { name: string }) => a.name)).toEqual(['Exame']);
    expect(res.body.overdue).toBe(1);
    expect(res.body.count).toBe(2);
  });

  it('exige sessão', async () => {
    expect((await request(app).get('/api/alerts')).status).toBe(401);
  });
});
