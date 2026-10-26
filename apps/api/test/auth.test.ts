import { TERMS_VERSION } from '@studentos/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { PASSWORD, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);

describe('registo (HU01)', () => {
  it('cria a conta, inicia sessão e cria o semestre ativo', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'Ines@Exemplo.pt ', password: PASSWORD, acceptTerms: true });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Inês', email: 'ines@exemplo.pt' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = res.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toMatch(/sid=.+; .*HttpOnly/i);

    const me = await request(app).get('/api/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.activeSemester.label).toMatch(/semestre/);

    // Fica registada a versão dos Termos aceite e quando
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ines@exemplo.pt' } });
    expect(user.termsVersion).toBe(TERMS_VERSION);
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('sem aceitar os Termos não cria conta (400 no campo acceptTerms)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'ines@exemplo.pt', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'acceptTerms' });
    expect(await prisma.user.count()).toBe(0);
  });

  it('recusa email já registado (409)', async () => {
    await registerUser('ines');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Outra', email: 'ines@exemplo.pt', password: PASSWORD, acceptTerms: true });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Este email já está registado');
  });

  it('recusa palavra-passe curta com erro no campo (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'ines@exemplo.pt', password: 'curta', acceptTerms: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'password' });
  });

  it('recusa palavras-passe comuns', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'ines@exemplo.pt', password: 'password1234', acceptTerms: true });
    expect(res.status).toBe(400);
  });

  it('rejeita campos desconhecidos', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Inês', email: 'ines@exemplo.pt', password: PASSWORD, acceptTerms: true, isAdmin: true });
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

  it('logout invalida a sessão no servidor, não só o cookie (spec §14.1)', async () => {
    const { cookie } = await registerUser('rui');
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    // o mesmo cookie, reenviado depois do logout, já não é aceite
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('o login cria uma sessão nova e destrói a anterior trazida pelo pedido (rotação)', async () => {
    const { cookie: first } = await registerUser('rui');
    const login = await request(app)
      .post('/api/auth/login')
      .set('Cookie', first)
      .send({ email: 'rui@exemplo.pt', password: PASSWORD });
    const second = login.headers['set-cookie'] as unknown as string[];
    expect(second[0]).not.toBe(first[0]);
    expect((await request(app).get('/api/me').set('Cookie', first)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Cookie', second)).status).toBe(200);
  });

  it('a base de dados guarda só o hash do token, nunca o token', async () => {
    const { cookie } = await registerUser('rui');
    const token = /sid=([^;]+)/.exec(cookie[0]!)![1]!;
    const rows = await prisma.userSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(token);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sessões expiradas são recusadas e removidas', async () => {
    const { cookie } = await registerUser('rui');
    await prisma.userSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
    expect(await prisma.userSession.count()).toBe(0);
  });

  it('lista as sessões ativas e permite revogar outra sessão', async () => {
    const { cookie: phone } = await registerUser('rui');
    const login = await request(app).post('/api/auth/login').send({ email: 'rui@exemplo.pt', password: PASSWORD });
    const laptop = login.headers['set-cookie'] as unknown as string[];

    const list = await request(app).get('/api/me/sessions').set('Cookie', laptop);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash/);

    const other = list.body.find((s: { current: boolean }) => !s.current);
    expect((await request(app).delete(`/api/me/sessions/${other.id}`).set('Cookie', laptop)).status).toBe(204);
    expect((await request(app).get('/api/me').set('Cookie', phone)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Cookie', laptop)).status).toBe(200);
  });

  it('não permite revogar sessões de outro utilizador (404)', async () => {
    const { cookie: rui } = await registerUser('rui');
    const { cookie: ines } = await registerUser('ines');
    const [inesSession] = (await request(app).get('/api/me/sessions').set('Cookie', ines)).body;
    expect((await request(app).delete(`/api/me/sessions/${inesSession.id}`).set('Cookie', rui)).status).toBe(404);
    expect((await request(app).get('/api/me').set('Cookie', ines)).status).toBe(200);
  });

  it('GET /api/auth/me devolve o utilizador autenticado', async () => {
    const { cookie } = await registerUser('rui');
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.body.user.email).toBe('rui@exemplo.pt');
  });

  it('os erros incluem requestId (spec §13.2)', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
    expect(res.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
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

describe('mudar a palavra-passe', () => {
  const change = (cookie: string[], body: object) =>
    request(app).post('/api/me/password').set('Cookie', cookie).send(body);
  const login = (password: string) => request(app).post('/api/auth/login').send({ email: 'ines@exemplo.pt', password });

  it('exige a palavra-passe atual e recusa palavras-passe comuns', async () => {
    const { cookie } = await registerUser('ines');
    const wrong = await change(cookie, { currentPassword: 'nao-e-esta-de-todo', newPassword: 'outra-frase-bem-longa' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details[0].path).toBe('currentPassword');
    const common = await change(cookie, { currentPassword: PASSWORD, newPassword: 'password1234' });
    expect(common.status).toBe(400);
    expect(common.body.error.details[0].path).toBe('newPassword');
    const same = await change(cookie, { currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);
    expect((await login(PASSWORD)).status).toBe(200);
  });

  it('muda a palavra-passe, termina as sessões dos outros dispositivos e renova a deste', async () => {
    const { cookie: phone } = await registerUser('ines');
    const laptop = (await login(PASSWORD)).headers['set-cookie'] as unknown as string[];
    const res = await change(phone, { currentPassword: PASSWORD, newPassword: 'nova-frase-bem-segura' });
    expect(res.status).toBe(204);
    const renewed = res.headers['set-cookie'] as unknown as string[];
    expect(renewed[0]).toMatch(/sid=.+; .*HttpOnly/i);

    expect((await request(app).get('/api/me').set('Cookie', laptop)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Cookie', phone)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Cookie', renewed)).status).toBe(200);
    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login('nova-frase-bem-segura')).status).toBe(200);
  });

  it('exige sessão', async () => {
    const res = await request(app).post('/api/me/password').send({ currentPassword: 'a', newPassword: 'b' });
    expect(res.status).toBe(401);
  });
});
