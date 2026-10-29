import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAiProviderForTests } from '../src/ai/access.js';
import { chunkText, sanitizeProposals } from '../src/ai/documents.js';
import { EMBEDDING_DIMENSIONS } from '../src/ai/provider.js';
import { app } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { FakeAiProvider } from './fake-ai.js';
import { createUserAndLogin, resetDb } from './helpers.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString('base64');
const photo = { filename: 'apontamentos.jpg', mimeType: 'image/jpeg', data: jpeg };

const extraction = (items: unknown[] = []) => ({
  title: 'Calendário de avaliação de PW',
  pageCount: 1,
  text: 'Programação Web\n\nTeste 1 a 12 de novembro.\n\nEntrega do projeto a 5 de dezembro.',
  items,
});
const item = (over: Record<string, unknown>) => ({
  target: 'assessment',
  title: 'Teste 1',
  assessmentType: 'TEST',
  weight: null,
  minScore: null,
  date: '2026-11-12',
  time: null,
  evidence: 'Teste 1 a 12 de novembro',
  ...over,
});

let owner: string[];
let other: string[];
let disciplineId: number;
let fake: FakeAiProvider;

beforeEach(async () => {
  await resetDb();
  ({ cookie: owner, disciplineId } = await createUserAndLogin('dono'));
  ({ cookie: other } = await createUserAndLogin('colega'));
  env.AI_ALLOWED_EMAILS = ['dono@exemplo.pt'];
  await request(app).post('/api/ai/consent').set('Cookie', owner);
});

afterEach(() => {
  env.AI_ALLOWED_EMAILS = [];
  setAiProviderForTests(undefined);
});

function upload(cookie: string[], responses: unknown[], body: Record<string, unknown> = {}) {
  fake = new FakeAiProvider(responses);
  setAiProviderForTests(fake);
  return request(app)
    .post('/api/documents')
    .set('Cookie', cookie)
    .send({ files: [photo], disciplineId, ...body });
}

/** A leitura corre em segundo plano: espera até o documento deixar de estar PROCESSING. */
async function readDone(id: number, cookie = owner) {
  for (let i = 0; i < 100; i++) {
    const { body } = await request(app).get(`/api/documents/${id}`).set('Cookie', cookie);
    if (body.status !== 'PROCESSING') return body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('A leitura não terminou');
}

describe('POST /api/documents', () => {
  it('só com a IA ativa: sem consentimento ou fora da lista dá 403 e não chama a IA', async () => {
    await request(app).delete('/api/ai/consent').set('Cookie', owner);
    const res = await upload(owner, [extraction()]);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AI_NOT_ENABLED');
    expect((await upload(other, [extraction()], { disciplineId: null })).status).toBe(403);
    expect(fake.requests).toHaveLength(0);
  });

  it('recusa ficheiros que não são o que dizem ser, sem chamar a IA', async () => {
    const fakePdf = { filename: 'x.pdf', mimeType: 'application/pdf', data: jpeg };
    const res = await upload(owner, [extraction()], { files: [fakePdf] });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'files.0' });
    expect(fake.requests).toHaveLength(0);
  });

  it('a disciplina tem de ser da conta', async () => {
    const theirs = await prisma.discipline.findFirstOrThrow({ where: { user: { email: 'colega@exemplo.pt' } } });
    expect((await upload(owner, [extraction()], { disciplineId: theirs.id })).status).toBe(404);
  });

  it('guarda o texto e os excertos com vetores; as datas ficam por rever, já validadas', async () => {
    const res = await upload(owner, [
      extraction([
        item({}),
        item({ target: 'task', title: 'Entrega do projeto', assessmentType: 'OTHER', date: '2026-12-05' }),
        item({ title: 'Teste 2', date: '31 de novembro' }), // data inválida e sem peso: descartada
      ]),
    ]);
    // Responde logo (202) e lê em segundo plano.
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'PROCESSING', title: 'apontamentos.jpg', pendingProposals: 0 });
    const doc = await readDone(res.body.id);
    expect(doc).toMatchObject({
      status: 'READY',
      title: 'Calendário de avaliação de PW',
      source: 'SCAN',
      pendingProposals: 2,
      failureReason: null,
    });
    expect(doc.proposals.map((p: { title: string }) => p.title)).toEqual(['Teste 1', 'Entrega do projeto']);
    expect(fake.requests[0]![0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: jpeg } });

    const chunks = await prisma.documentChunk.findMany({ where: { documentId: res.body.id } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(chunks[0]!.embeddingModel).toBe('fake-embedding');
  });

  it('se a leitura falhar, o documento fica FAILED com o motivo, sem excertos', async () => {
    const res = await upload(owner, [{ ...extraction(), text: '  ' }]);
    expect(await readDone(res.body.id)).toMatchObject({
      status: 'FAILED',
      failureReason: expect.stringMatching(/Não foi possível ler texto/),
    });
    // A IA responde fora do formato: o erro da IA, já em português, fica como motivo.
    const bad = await upload(owner, [{ nada: true }]);
    expect((await readDone(bad.body.id)).failureReason).toBe('A resposta da IA não veio no formato esperado.');
    expect(await prisma.documentChunk.count()).toBe(0);
  });

  it('uma leitura parada há mais de 15 min (servidor reiniciado) passa a FAILED', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dono@exemplo.pt' } });
    const doc = await prisma.studyDocument.create({
      data: { title: 'Antigo', source: 'SCAN', status: 'PROCESSING', userId: user.id },
    });
    await prisma.$executeRaw`UPDATE "StudyDocument" SET "updatedAt" = now() - interval '20 minutes' WHERE id = ${doc.id}`;
    const { body } = await request(app).get('/api/documents').set('Cookie', owner);
    expect(body[0]).toMatchObject({ status: 'FAILED', failureReason: expect.stringMatching(/interrompida/) });
  });
});

describe('revisão e confirmação das datas', () => {
  async function createDocument(items: unknown[]) {
    const res = await upload(owner, [extraction(items)]);
    await readDone(res.body.id);
    return res.body.id as number;
  }
  const confirm = (id: number, items: unknown[], cookie = owner) =>
    request(app).post(`/api/documents/${id}/confirm`).set('Cookie', cookie).send({ items });
  const base = { time: null, disciplineId: null, weight: null, minScore: null, assessmentId: null };

  it('liga as propostas ao que já existe: avaliação com o mesmo nome e tarefa igual no mesmo dia', async () => {
    const existing = await prisma.assessment.create({ data: { name: 'teste 1', weight: 40, disciplineId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dono@exemplo.pt' } });
    await prisma.task.create({
      data: { title: 'Entrega do projeto', dueDate: new Date('2026-12-05T23:59:00Z'), userId: user.id },
    });
    const id = await createDocument([
      item({}),
      item({ target: 'task', title: 'Entrega do Projeto', assessmentType: 'OTHER', date: '2026-12-05' }),
    ]);
    const { body } = await request(app).get(`/api/documents/${id}`).set('Cookie', owner);
    expect(body.proposals[0]).toMatchObject({ match: { id: existing.id, name: 'teste 1' }, duplicate: false });
    expect(body.proposals[1]).toMatchObject({ match: null, duplicate: true });
  });

  it('grava só o que foi confirmado, numa transação, e a segunda confirmação não grava nada', async () => {
    const existing = await prisma.assessment.create({ data: { name: 'Teste 1', weight: 40, disciplineId } });
    const id = await createDocument([item({})]);
    const items = [
      {
        ...base,
        target: 'assessment',
        title: 'Teste 1',
        date: '2026-11-12',
        assessmentType: 'TEST',
        assessmentId: existing.id,
      },
      {
        ...base,
        target: 'assessment',
        title: 'Projeto',
        date: null,
        assessmentType: 'PROJECT',
        disciplineId,
        weight: 60,
        minScore: 9.5,
      },
      { ...base, target: 'task', title: 'Entrega do projeto', date: '2026-12-05', assessmentType: 'OTHER' },
    ];
    const res = await confirm(id, items);
    expect(res.body).toEqual({ created: 2, updated: 1 });

    // 12/11 às 09:00 em Lisboa (inverno, UTC+0); a tarefa fica às 23:59 do dia.
    const updated = await prisma.assessment.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated.date?.toISOString()).toBe('2026-11-12T09:00:00.000Z');
    expect(await prisma.assessment.findFirst({ where: { name: 'Projeto' } })).toMatchObject({
      weight: 60,
      minScore: 9.5,
    });
    const task = await prisma.task.findFirstOrThrow({ where: { title: 'Entrega do projeto' } });
    expect(task.dueDate?.toISOString()).toBe('2026-12-05T23:59:00.000Z');
    expect(task.description).toBe('Do documento «Calendário de avaliação de PW»');

    const again = await confirm(id, items);
    expect(again.status).toBe(409);
    expect(await prisma.task.count({ where: { title: 'Entrega do projeto' } })).toBe(1);
    expect((await request(app).get(`/api/documents/${id}`).set('Cookie', owner)).body.pendingProposals).toBe(0);
  });

  it('a soma dos pesos não passa de 100%: nada fica gravado e as datas continuam por rever', async () => {
    await prisma.assessment.create({ data: { name: 'Exame', weight: 70, disciplineId } });
    const id = await createDocument([item({})]);
    const task = { ...base, target: 'task', title: 'Ler capítulo 3', date: '2026-11-01', assessmentType: 'OTHER' };
    const res = await confirm(id, [
      task,
      { ...base, target: 'assessment', title: 'Teste 1', date: null, assessmentType: 'TEST', disciplineId, weight: 40 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'items.1.weight' });
    expect(await prisma.task.count({ where: { title: 'Ler capítulo 3' } })).toBe(0);
    expect((await request(app).get(`/api/documents/${id}`).set('Cookie', owner)).body.pendingProposals).toBe(1);
  });

  it('valida cada item: avaliação nova precisa de disciplina e peso', async () => {
    const id = await createDocument([item({})]);
    const res = await confirm(id, [
      { ...base, target: 'assessment', title: 'Teste 1', date: null, assessmentType: 'TEST' },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual([
      'items.0.disciplineId',
      'items.0.weight',
    ]);
  });

  it('documentos, disciplinas e avaliações de outra conta dão 404', async () => {
    const id = await createDocument([item({})]);
    expect((await request(app).get(`/api/documents/${id}`).set('Cookie', other)).status).toBe(404);
    expect((await confirm(id, [], other)).status).toBe(404);
    expect((await request(app).delete(`/api/documents/${id}`).set('Cookie', other)).status).toBe(404);
    expect((await request(app).get('/api/documents').set('Cookie', other)).body).toEqual([]);

    const theirDiscipline = await prisma.discipline.findFirstOrThrow({
      where: { user: { email: 'colega@exemplo.pt' } },
    });
    const theirs = await prisma.assessment.create({
      data: { name: 'Deles', weight: 50, disciplineId: theirDiscipline.id },
    });
    const res = await confirm(id, [
      {
        ...base,
        target: 'assessment',
        title: 'Deles',
        date: '2026-11-12',
        assessmentType: 'TEST',
        assessmentId: theirs.id,
      },
    ]);
    expect(res.status).toBe(404);
    expect((await prisma.assessment.findUniqueOrThrow({ where: { id: theirs.id } })).date).toBeNull();
  });

  it('ignorar todas esvazia a revisão; eliminar apaga também os excertos', async () => {
    const id = await createDocument([item({})]);
    expect((await confirm(id, [])).body).toEqual({ created: 0, updated: 0 });
    expect((await request(app).delete(`/api/documents/${id}`).set('Cookie', owner)).status).toBe(204);
    expect(await prisma.documentChunk.count()).toBe(0);
  });
});

describe('regras puras dos documentos', () => {
  it('chunkText junta parágrafos até ao limite e parte os longos em frases', () => {
    expect(chunkText('a\n\nb\n\n\nc', 10)).toEqual(['a\n\nb\n\nc']);
    const long = `${'Frase um. '.repeat(30)}`.trim();
    const chunks = chunkText(`Título\n\n${long}`, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(`Título ${long}`);
    expect(chunkText('   ')).toEqual([]);
  });

  it('sanitizeProposals guarda só datas, horas e pesos válidos', () => {
    const [kept, ...rest] = sanitizeProposals([
      item({ date: '2026-02-29', time: '25:00', weight: 30, minScore: 25 }), // 2026 não é bissexto
      item({ target: 'task', date: null }),
      item({ title: '   ' }),
    ] as Parameters<typeof sanitizeProposals>[0]);
    expect(kept).toMatchObject({ date: null, time: null, weight: 30, minScore: null });
    expect(rest).toEqual([]);
  });
});
