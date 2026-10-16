import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { PASSWORD, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);

describe('registo (HU01)', () => {
  it('cria a conta, inicia sessão e cria o semestre ativo', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'Ines@Exemplo.pt ', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Inês', email: 'ines@exemplo.pt' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = res.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toMatch(/sid=.+; .*HttpOnly/i);

    const me = await request(app).get('/api/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.activeSemester.label).toMatch(/semestre/);
  });

  it('recusa email já registado (409)', async () => {
    await registerUser('ines');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Outra', email: 'ines@exemplo.pt', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este email já está registado');
  });

  it('recusa palavra-passe curta com erro no campo (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'ines@exemplo.pt', password: 'curta' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'password' });
  });

  it('recusa palavras-passe comuns', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'ines@exemplo.pt', password: 'password1234' });
    expect(res.status).toBe(400);
  });

  it('rejeita campos desconhecidos', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'ines@exemplo.pt', password: PASSWORD, isAdmin: true });
    expect(res.status).toBe(400);
  });
});

describe('login e sessão (RF02)', () => {
  it('inicia sessão com credenciais certas', async () => {
    await registerUser('rui');
    const res = await request(app).post('/api/auth/login').send({ email: 'rui@exemplo.pt', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('mensagem genérica para email inexistente ou palavra-passe errada', async () => {
    await registerUser('rui');
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rui@exemplo.pt', password: 'errada-errada' });
    const missing = await request(app).post('/api/auth/login').send({ email: 'nao@exemplo.pt', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it('exige sessão nas rotas protegidas', async () => {
    expect((await request(app).get('/api/tasks')).status).toBe(401);
    expect((await request(app).get('/api/me').set('Cookie', 'sid=invalido')).status).toBe(401);
  });

  it('logout-all invalida os tokens anteriores', async () => {
    const { cookie } = await registerUser('rui');
    expect((await request(app).post('/api/auth/logout-all').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('rejeita pedidos que alteram dados sem ser JSON (CSRF)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: 'rui@exemplo.pt', password: PASSWORD });
    expect(res.status).toBe(415);
  });
});
