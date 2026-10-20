import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
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

describe('GET /api/dashboard — "hoje" é o dia de Lisboa, não o do servidor', () => {
  afterEach(() => vi.useRealTimers());

  it('às 00:30 de Lisboa (23:30 UTC no verão) já não mostra as avaliações de ontem', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T23:30:00Z')); // 16/07, 00:30 em Lisboa
    await prisma.assessment.createMany({
      data: [
        {
          disciplineId: aliceDisciplineId,
          name: 'Ontem',
          type: 'TEST',
          weight: 10,
          date: new Date('2026-07-15T10:00:00Z'),
        },
        {
          disciplineId: aliceDisciplineId,
          name: 'Hoje',
          type: 'TEST',
          weight: 10,
          date: new Date('2026-07-16T09:00:00Z'),
        },
      ],
    });
    const res = await request(app).get('/api/dashboard').set('Cookie', alice);
    expect(res.body.upcomingAssessments.map((a: { name: string }) => a.name)).toEqual(['Hoje']);
  });
});

describe('GET /api/tasks — pesquisa e prioridade (spec §7.3)', () => {
  it('pesquisa no título e na descrição, sem distinguir maiúsculas, e filtra por prioridade', async () => {
    const post = (body: object) => request(app).post('/api/tasks').set('Cookie', alice).send(body);
    await post({ title: 'Relatório de Bases de Dados', priority: 'HIGH' });
    await post({ title: 'Ficha 3', description: 'exercícios de RELATÓRIO', priority: 'LOW' });
    await post({ title: 'Outra coisa', priority: 'HIGH' });

    const search = await request(app).get('/api/tasks?q=relatório').set('Cookie', alice);
    expect(search.body.map((t: { title: string }) => t.title).sort()).toEqual([
      'Ficha 3',
      'Relatório de Bases de Dados',
    ]);
    const high = await request(app).get('/api/tasks?q=relatório&priority=HIGH').set('Cookie', alice);
    expect(high.body.map((t: { title: string }) => t.title)).toEqual(['Relatório de Bases de Dados']);
    const noAccents = await request(app).get('/api/tasks?q=relatorio').set('Cookie', alice);
    expect(noAccents.body).toHaveLength(2);
    // a pesquisa nunca devolve tarefas de outro utilizador
    expect((await request(app).get('/api/tasks?q=relatório').set('Cookie', bob)).body).toEqual([]);
  });
});
