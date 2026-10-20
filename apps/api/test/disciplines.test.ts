import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { PASSWORD, createUserAndLogin, resetDb } from './helpers.js';

let cookie: string[];
let disciplineId: number;

beforeEach(async () => {
  await resetDb();
  ({ cookie, disciplineId } = await createUserAndLogin('ines'));
});

const addAssessment = (body: object) =>
  request(app).post(`/api/disciplines/${disciplineId}/assessments`).set('Cookie', cookie).send(body);

describe('disciplinas (RF04)', () => {
  it('associa a nova disciplina ao semestre ativo', async () => {
    const res = await request(app).get(`/api/disciplines/${disciplineId}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.semester.isActive).toBe(true);
    expect(res.body.grades.status).toBe('no-assessments');
  });

  it('recusa sigla repetida no mesmo semestre (409)', async () => {
    const res = await request(app).post('/api/disciplines').set('Cookie', cookie).send({ name: 'Outra', code: 'pw' });
    expect(res.status).toBe(409);
  });
});

describe('avaliações (HU02)', () => {
  it('recusa pesos que somam mais de 100% (RN03)', async () => {
    expect((await addAssessment({ name: 'Teste', weight: 70 })).status).toBe(201);
    const res = await addAssessment({ name: 'Exame', weight: 40 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toBe('A soma dos pesos não pode exceder 100% (atual: 70%)');
  });

  it('também valida o peso ao editar', async () => {
    await addAssessment({ name: 'A', weight: 50 });
    const { body: b } = await addAssessment({ name: 'B', weight: 50 });
    const res = await request(app).patch(`/api/assessments/${b.id}`).set('Cookie', cookie).send({ weight: 60 });
    expect(res.status).toBe(400);
  });

  it('avaliação sem nota fica pendente e não conta para a média', async () => {
    await addAssessment({ name: 'Teste 1', weight: 30, score: 12 });
    const res = await addAssessment({ name: 'Exame', weight: 70 });
    expect(res.body.score).toBeNull();
    const d = await request(app).get(`/api/disciplines/${disciplineId}`).set('Cookie', cookie);
    expect(d.body.grades.currentAverage).toBe(12);
  });
});

describe('médias e nota necessária (HU03, exemplo 4.1)', () => {
  beforeEach(async () => {
    await addAssessment({ name: 'Teste 1', weight: 30, score: 12 });
    await addAssessment({ name: 'Trabalho prático', weight: 30, score: 15 });
    await addAssessment({ name: 'Exame', weight: 40, minScore: 8, type: 'EXAM' });
  });

  it('para passar precisa de 8 (nota mínima do exame)', async () => {
    const res = await request(app).get(`/api/disciplines/${disciplineId}/grades`).set('Cookie', cookie);
    expect(res.body.currentAverage).toBe(13.5);
    expect(res.body.required).toEqual({ target: 10, result: { status: 'needed', value: 8 } });
  });

  it('para ter 14 precisa de 13,5 e 20 é impossível', async () => {
    const r14 = await request(app).get(`/api/disciplines/${disciplineId}/grades?target=14`).set('Cookie', cookie);
    expect(r14.body.required.result).toEqual({ status: 'needed', value: 13.5 });
    const r20 = await request(app).get(`/api/disciplines/${disciplineId}/grades?target=20`).set('Cookie', cookie);
    expect(r20.body.required.result).toEqual({ status: 'impossible', reason: 'above-max' });
  });
});

describe('eliminação (RN12)', () => {
  it('elimina avaliações em cascata e mantém as tarefas sem disciplina', async () => {
    await addAssessment({ name: 'Teste', weight: 50 });
    const { body: task } = await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'T', disciplineId });
    expect((await request(app).delete(`/api/disciplines/${disciplineId}`).set('Cookie', cookie)).status).toBe(204);
    const t = await request(app).get(`/api/tasks/${task.id}`).set('Cookie', cookie);
    expect(t.status).toBe(200);
    expect(t.body.disciplineId).toBeNull();
  });
});

describe('conta (RF11, RF12)', () => {
  it('exporta os dados sem a hash da palavra-passe', async () => {
    const res = await request(app).get('/api/me/export').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.disciplines).toHaveLength(1);
  });

  it('elimina a conta só com o email e a palavra-passe certos (HU06)', async () => {
    const del = (body: object) => request(app).delete('/api/me').set('Cookie', cookie).send(body);
    expect((await del({ confirmEmail: 'x@exemplo.pt', password: PASSWORD })).status).toBe(400);
    // um cookie roubado não chega: sem a palavra-passe a conta não é eliminada
    expect((await del({ confirmEmail: 'ines@exemplo.pt' })).status).toBe(400);
    const wrongPassword = await del({ confirmEmail: 'ines@exemplo.pt', password: 'outra-coisa-qualquer' });
    expect(wrongPassword.status).toBe(400);
    expect(wrongPassword.body.error.details[0].path).toBe('password');
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(200);
    const ok = await del({ confirmEmail: 'ines@exemplo.pt', password: PASSWORD });
    expect(ok.status).toBe(204);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('arquivar disciplinas (spec §7.2)', () => {
  it('arquivar retira das listas ativas sem apagar o histórico, e reativar devolve-a', async () => {
    await addAssessment({ name: 'Teste', weight: 50, score: 14 });
    const archive = await request(app)
      .patch(`/api/disciplines/${disciplineId}`)
      .set('Cookie', cookie)
      .send({ archived: true });
    expect(archive.status).toBe(200);
    expect(archive.body.archivedAt).not.toBeNull();

    expect((await request(app).get('/api/disciplines').set('Cookie', cookie)).body).toEqual([]);
    const archived = await request(app).get('/api/disciplines?archived=true').set('Cookie', cookie);
    expect(archived.body).toHaveLength(1);
    expect(archived.body[0].assessments).toHaveLength(1); // histórico preservado
    expect((await request(app).get('/api/dashboard').set('Cookie', cookie)).body.disciplines).toEqual([]);

    await request(app).patch(`/api/disciplines/${disciplineId}`).set('Cookie', cookie).send({ archived: false });
    expect((await request(app).get('/api/disciplines').set('Cookie', cookie)).body).toHaveLength(1);
  });
});
