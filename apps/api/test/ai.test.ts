import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { setAiProviderForTests } from '../src/ai/access.js';
import { GeminiProvider } from '../src/ai/gemini.js';
import { AiError, EMBEDDING_DIMENSIONS } from '../src/ai/provider.js';
import { app } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { FakeAiProvider } from './fake-ai.js';
import { PASSWORD, createUserAndLogin, resetDb } from './helpers.js';

let owner: string[];
let other: string[];

beforeEach(async () => {
  await resetDb();
  ({ cookie: owner } = await createUserAndLogin('dono'));
  ({ cookie: other } = await createUserAndLogin('colega'));
  env.AI_ALLOWED_EMAILS = ['dono@exemplo.pt'];
  setAiProviderForTests(new FakeAiProvider([{ ok: true }]));
});

afterEach(() => {
  env.AI_ALLOWED_EMAILS = [];
  setAiProviderForTests(undefined);
});

const status = (cookie: string[]) => request(app).get('/api/ai/status').set('Cookie', cookie);

describe('acesso à IA: lista de contas, chave e consentimento', () => {
  it('uma conta fora da lista só vê NOT_ALLOWED e não pode dar consentimento', async () => {
    expect((await status(other)).body).toEqual({ status: 'NOT_ALLOWED' });
    const consent = await request(app).post('/api/ai/consent').set('Cookie', other);
    expect(consent.status).toBe(403);
    expect(consent.body.error.code).toBe('AI_NOT_ALLOWED');
  });

  it('sem chave no servidor fica NOT_CONFIGURED', async () => {
    setAiProviderForTests(null);
    expect((await status(owner)).body.status).toBe('NOT_CONFIGURED');
  });

  it('o consentimento ativa e retirá-lo desativa; fica registada a versão e a data', async () => {
    expect((await status(owner)).body).toMatchObject({ status: 'NEEDS_CONSENT', model: 'fake' });
    const given = await request(app).post('/api/ai/consent').set('Cookie', owner);
    expect(given.body).toMatchObject({ status: 'ENABLED', consentVersion: '2026-10-27' });
    expect(given.body.consentAt).toEqual(expect.any(String));

    expect((await request(app).delete('/api/ai/consent').set('Cookie', owner)).status).toBe(204);
    expect((await status(owner)).body).toMatchObject({ status: 'NEEDS_CONSENT', consentAt: null });
  });

  it('um consentimento dado a um texto anterior deixa de valer: volta a NEEDS_CONSENT', async () => {
    await request(app).post('/api/ai/consent').set('Cookie', owner);
    await prisma.user.update({ where: { email: 'dono@exemplo.pt' }, data: { aiConsentVersion: '2026-10-26' } });
    expect((await status(owner)).body).toMatchObject({ status: 'NEEDS_CONSENT', consentVersion: '2026-10-26' });
    expect((await request(app).post('/api/ai/check').set('Cookie', owner)).status).toBe(403);
  });

  it('a verificação só corre com a IA ativa e só diz «ligado» com uma resposta válida', async () => {
    const check = () => request(app).post('/api/ai/check').set('Cookie', owner);
    const blocked = await check();
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('AI_NOT_ENABLED');

    await request(app).post('/api/ai/consent').set('Cookie', owner);
    expect((await check()).body).toEqual({ ok: true, model: 'fake' });
    // A fila do fornecedor falso esvaziou: resposta inválida → 502 em português, sem detalhes técnicos
    const invalid = await check();
    expect(invalid.status).toBe(502);
    expect(invalid.body.error).toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });
});

describe('Gemini pela API REST', () => {
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  const answer = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

  it('envia a chave só no cabeçalho e o esquema Zod como JSON Schema; valida a resposta', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => ok(answer('{"nota": 14}')));
    const gemini = new GeminiProvider('chave-secreta', 'modelo-x', 'emb-y', fetchMock as unknown as typeof fetch);
    const result = await gemini.generateJson(z.object({ nota: z.number() }), [{ text: 'olá' }]);
    expect(result).toEqual({ nota: 14 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/modelo-x:generateContent');
    expect(url).not.toContain('chave-secreta');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'chave-secreta' });
    const body = JSON.parse(String(init?.body)) as { generationConfig: Record<string, unknown> };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema).toMatchObject({
      type: 'object',
      properties: { nota: { type: 'number' } },
    });
    expect(body.generationConfig.responseJsonSchema).not.toHaveProperty('$schema');
  });

  it('respostas fora do esquema, vazias ou com limite de pedidos dão erros claros', async () => {
    const schema = z.object({ nota: z.number() });
    const withResponse = (response: Promise<Response>) =>
      new GeminiProvider('k', 'm', 'e', (() => response) as unknown as typeof fetch);
    await expect(withResponse(ok(answer('{"nota": "catorze"}'))).generateJson(schema, [])).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
    await expect(withResponse(ok({ candidates: [] })).generateJson(schema, [])).rejects.toMatchObject({
      code: 'AI_BLOCKED',
    });
    const cut = { candidates: [{ content: { parts: [{ text: '{"nota": 1' }] }, finishReason: 'MAX_TOKENS' }] };
    await expect(withResponse(ok(cut)).generateJson(schema, [])).rejects.toThrow(/demasiado longa/);
    await expect(
      withResponse(Promise.resolve(new Response('{}', { status: 429 }))).generateJson(schema, []),
    ).rejects.toBeInstanceOf(AiError);
  });

  it('pede vetores de 768 dimensões por tipo de tarefa e devolve-os normalizados', async () => {
    const raw = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 2);
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => ok({ embeddings: [{ values: raw }] }));
    const gemini = new GeminiProvider('k', 'm', 'gemini-embedding-001', fetchMock as unknown as typeof fetch);
    const [vector] = await gemini.embed(['texto'], 'query');
    expect(Math.hypot(...vector!)).toBeCloseTo(1, 6);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('gemini-embedding-001:batchEmbedContents');
    expect(JSON.parse(String(init?.body)).requests[0]).toMatchObject({
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: 768,
    });

    const wrong = new GeminiProvider('k', 'm', 'e', (() =>
      ok({ embeddings: [{ values: [1, 2] }] })) as unknown as typeof fetch);
    await expect(wrong.embed(['texto'], 'document')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });
});

describe('dados novos na exportação e na eliminação da conta', () => {
  async function seedOwnerData() {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dono@exemplo.pt' } });
    const doc = await prisma.studyDocument.create({
      data: { title: 'Apontamentos BD', source: 'TEXT', text: 'Normalização', userId: user.id },
    });
    await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        userId: user.id,
        ordinal: 0,
        content: 'Normalização',
        embedding: [1, 0],
        embeddingModel: 'm',
      },
    });
    await prisma.studyCard.create({ data: { kind: 'SHORT', question: 'O que é a 3FN?', userId: user.id } });
    await prisma.financeTransaction.create({
      data: { kind: 'EXPENSE', amountCents: 450, occurredOn: new Date('2026-10-20'), userId: user.id },
    });
    return user;
  }

  it('a exportação inclui documentos, perguntas e finanças, sem os vetores', async () => {
    await seedOwnerData();
    const { body } = await request(app).get('/api/me/export').set('Cookie', owner);
    expect(body.studyDocuments).toHaveLength(1);
    expect(body.documentChunks[0]).toEqual({
      id: expect.any(Number),
      documentId: expect.any(Number),
      ordinal: 0,
      content: 'Normalização',
    });
    expect(body.studyCards).toHaveLength(1);
    expect(body.transactions[0]).toMatchObject({ amountCents: 450, kind: 'EXPENSE' });
  });

  it('eliminar a conta apaga também os dados novos', async () => {
    const user = await seedOwnerData();
    const res = await request(app)
      .delete('/api/me')
      .set('Cookie', owner)
      .send({ confirmEmail: 'dono@exemplo.pt', password: PASSWORD });
    expect(res.status).toBe(204);
    const where = { where: { userId: user.id } };
    expect(await prisma.studyDocument.count(where)).toBe(0);
    expect(await prisma.documentChunk.count(where)).toBe(0);
    expect(await prisma.studyCard.count(where)).toBe(0);
    expect(await prisma.financeTransaction.count(where)).toBe(0);
  });
});
