import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { createUserAndLogin, resetDb } from './helpers.js';

let alice: string[];
let bob: string[];
let aliceDisciplineId: number;

beforeEach(async () => {
  await resetDb();
  ({ cookie: alice, disciplineId: aliceDisciplineId } = await createUserAndLogin('alice'));
  ({ cookie: bob } = await createUserAndLogin('bob'));
});

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

describe('POST /api/tasks', () => {
  it('cria tarefa na própria disciplina (201)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', alice)
      .send({ title: 'Ler capítulo 3', disciplineId: aliceDisciplineId, priority: 'HIGH' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Ler capítulo 3', status: 'TODO', priority: 'HIGH' });
    expect(res.body.discipline.code).toBe('PW');
  });

  it('não permite associar a disciplina de outro utilizador (HU05 — 404)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', bob)
      .send({ title: 'Ataque', disciplineId: aliceDisciplineId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DISCIPLINE_NOT_FOUND');
  });

  it('valida o título', async () => {
    const res = await request(app).post('/api/tasks').set('Cookie', alice).send({ title: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('title');
  });
});

describe('isolamento de dados (RN10)', () => {
  it('outro utilizador não vê, altera nem elimina a tarefa (404)', async () => {
    const created = await request(app).post('/api/tasks').set('Cookie', alice).send({ title: 'Privada' });
    const id = created.body.id;
    expect((await request(app).get(`/api/tasks/${id}`).set('Cookie', bob)).status).toBe(404);
    expect((await request(app).patch(`/api/tasks/${id}`).set('Cookie', bob).send({ title: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/tasks/${id}`).set('Cookie', bob)).status).toBe(404);
    expect((await request(app).get('/api/tasks').set('Cookie', bob)).body).toHaveLength(0);
    expect((await request(app).get(`/api/disciplines/${aliceDisciplineId}`).set('Cookie', bob)).status).toBe(404);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('marcar como concluída define completedAt; reabrir limpa-o', async () => {
    const { body: task } = await request(app).post('/api/tasks').set('Cookie', alice).send({ title: 'T' });
    const done = await request(app).patch(`/api/tasks/${task.id}`).set('Cookie', alice).send({ status: 'DONE' });
    expect(done.body.status).toBe('DONE');
    expect(done.body.completedAt).not.toBeNull();
    const reopened = await request(app).patch(`/api/tasks/${task.id}`).set('Cookie', alice).send({ status: 'TODO' });
    expect(reopened.body.completedAt).toBeNull();
  });
});

describe('GET /api/tasks — filtros e ordenação (RF06)', () => {
  it('filtra por estado e ordena por prazo com tarefas sem prazo no fim', async () => {
    const post = (body: object) => request(app).post('/api/tasks').set('Cookie', alice).send(body);
    await post({ title: 'Sem prazo' });
    await post({ title: 'Depois', dueDate: inDays(5) });
    await post({ title: 'Antes', dueDate: inDays(1) });
    const { body: done } = await post({ title: 'Feita', dueDate: inDays(2) });
    await request(app).patch(`/api/tasks/${done.id}`).set('Cookie', alice).send({ status: 'DONE' });

    const res = await request(app).get('/api/tasks?status=TODO&sort=dueDate').set('Cookie', alice);
    expect(res.body.map((t: { title: string }) => t.title)).toEqual(['Antes', 'Depois', 'Sem prazo']);
  });
});

describe('GET /api/dashboard (HU04)', () => {
  it('mostra só os próximos 7 dias e as tarefas em atraso', async () => {
    const post = (body: object) => request(app).post('/api/tasks').set('Cookie', alice).send(body);
    await post({ title: 'Hoje', dueDate: inDays(0.1) });
    await post({ title: 'Daqui a 5 dias', dueDate: inDays(5) });
    await post({ title: 'Daqui a 10 dias', dueDate: inDays(10) });
    await post({ title: 'Ontem', dueDate: inDays(-1) });

    const res = await request(app).get('/api/dashboard').set('Cookie', alice);
    expect(res.status).toBe(200);
    expect(res.body.upcomingTasks.map((t: { title: string }) => t.title)).toEqual(['Hoje', 'Daqui a 5 dias']);
    expect(res.body.overdueTasks.map((t: { title: string }) => t.title)).toEqual(['Ontem']);
    expect(res.body.disciplines).toHaveLength(1);
  });
});
