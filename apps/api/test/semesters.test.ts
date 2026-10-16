import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { registerUser, resetDb } from './helpers.js';

let alice: string[];
let bob: string[];

beforeEach(async () => {
  await resetDb();
  ({ cookie: alice } = await registerUser('alice'));
  ({ cookie: bob } = await registerUser('bob'));
});

const next = {
  label: '2027/28 — 1.º semestre',
  startDate: '2027-09-01T00:00:00.000Z',
  endDate: '2028-01-31T00:00:00.000Z',
};

describe('semestres (RF03)', () => {
  it('o registo cria um semestre ativo', async () => {
    const res = await request(app).get('/api/semesters').set('Cookie', alice);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].isActive).toBe(true);
  });

  it('ativar um semestre desativa os restantes e as novas disciplinas vão para ele', async () => {
    const created = await request(app)
      .post('/api/semesters')
      .set('Cookie', alice)
      .send({ ...next, isActive: true });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/semesters').set('Cookie', alice);
    expect(list.body.filter((s: { isActive: boolean }) => s.isActive)).toHaveLength(1);
    expect((await request(app).get('/api/me').set('Cookie', alice)).body.activeSemester.id).toBe(created.body.id);

    const discipline = await request(app)
      .post('/api/disciplines')
      .set('Cookie', alice)
      .send({ name: 'Redes', code: 'RC' });
    expect(discipline.body.semesterId).toBe(created.body.id);
  });

  it('valida as datas ao editar, considerando os valores guardados', async () => {
    const { body } = await request(app).post('/api/semesters').set('Cookie', alice).send(next);
    const res = await request(app)
      .patch(`/api/semesters/${body.id}`)
      .set('Cookie', alice)
      .send({ endDate: '2027-08-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('endDate');

    const ok = await request(app).patch(`/api/semesters/${body.id}`).set('Cookie', alice).send({ label: 'Novo nome' });
    expect(ok.body.label).toBe('Novo nome');
  });

  it('outro utilizador não vê, altera nem elimina o semestre (404)', async () => {
    const { body } = await request(app).post('/api/semesters').set('Cookie', alice).send(next);
    expect((await request(app).patch(`/api/semesters/${body.id}`).set('Cookie', bob).send({ label: 'x' })).status).toBe(
      404,
    );
    expect((await request(app).delete(`/api/semesters/${body.id}`).set('Cookie', bob)).status).toBe(404);
    expect((await request(app).get('/api/semesters').set('Cookie', bob)).body).toHaveLength(1);
  });
});
