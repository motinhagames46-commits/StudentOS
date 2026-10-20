import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { credentialLimiter, generalLimiter } from '../src/lib/rate-limit.js';
import { requestId } from '../src/middleware/errors.js';

// Os limitadores estão desligados nos outros testes; aqui são testados numa app mínima com limites baixos.
function appWith(limiter: express.RequestHandler, status = 200) {
  const app = express();
  app.use(requestId);
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
});
