import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  accountLimiter,
  credentialLimiter,
  generalLimiter,
  loginLimiter,
  registerLimiter,
} from '../src/lib/rate-limit.js';
import { requestId } from '../src/middleware/errors.js';

// Os limitadores estão desligados nos outros testes; aqui são testados numa app mínima com limites baixos.
function appWith(limiter: express.RequestHandler, status = 200) {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  // Nos testes, a «sessão» vem num cabeçalho (o accountLimiter usa req.userId, definido pelo requireAuth).
  app.use((req, _res, next) => {
    req.userId = Number(req.get('x-user') ?? 0);
    next();
  });
  app.use(limiter);
  app.post('/x', (_req, res) => {
    res.status(status).json({ ok: status < 400 });
  });
  return app;
}

describe('limites de pedidos (secção 12.3)', () => {
  it('o limite geral responde 429 em JSON, em português e com requestId', async () => {
    const app = appWith(generalLimiter(2));
    await request(app).post('/x');
    await request(app).post('/x');
    const res = await request(app).post('/x');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: expect.stringMatching(/Demasiados pedidos/),
    });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('o limite de credenciais só conta tentativas falhadas', async () => {
    const ok = appWith(credentialLimiter(1), 200);
    for (let i = 0; i < 3; i++) expect((await request(ok).post('/x')).status).toBe(200);

    const failing = appWith(credentialLimiter(1), 400);
    expect((await request(failing).post('/x')).status).toBe(400);
    const blocked = await request(failing).post('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toMatch(/Demasiadas tentativas/);
  });

  it('o IP vem do CF-Connecting-IP (escrito pela Cloudflare), não de quem pede', async () => {
    const app = appWith(generalLimiter(1));
    const from = (ip: string) => request(app).post('/x').set('CF-Connecting-IP', ip);
    expect((await from('203.0.113.7')).status).toBe(200);
    expect((await from('203.0.113.7')).status).toBe(429);
    expect((await from('198.51.100.9')).status).toBe(200);
  });

  it('criar contas conta também os registos bem-sucedidos', async () => {
    const app = appWith(registerLimiter(2), 201);
    expect((await request(app).post('/x')).status).toBe(201);
    expect((await request(app).post('/x')).status).toBe(201);
    const blocked = await request(app).post('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toMatch(/demasiadas contas/);
  });

  it('logins falhados contam por IP e email: os erros de um colega não bloqueiam os outros', async () => {
    const app = appWith(loginLimiter(1), 401);
    const login = (email: string) => request(app).post('/x').send({ email, password: 'errada' });
    expect((await login('ana@exemplo.pt')).status).toBe(401);
    expect((await login(' ANA@exemplo.pt ')).status).toBe(429);
    expect((await login('rui@exemplo.pt')).status).toBe(401);
  });

  it('o limite por conta conta por utilizador, não pelo IP partilhado', async () => {
    const app = appWith(accountLimiter(1));
    const as = (user: number) => request(app).post('/x').set('x-user', String(user));
    expect((await as(1)).status).toBe(200);
    expect((await as(1)).status).toBe(429);
    expect((await as(2)).status).toBe(200);
  });
});
