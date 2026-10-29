import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAiProviderForTests } from '../src/ai/access.js';
import { sanitizeQuestions } from '../src/ai/quiz.js';
import { app } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { FakeAiProvider } from './fake-ai.js';
import { createUserAndLogin, resetDb } from './helpers.js';

const mcq = (over: Record<string, unknown> = {}) => ({
  kind: 'MCQ',
  question: 'Qual forma normal elimina dependências transitivas?',
  options: ['1FN', '2FN', '3FN', 'FNBC'],
  correctOption: 2,
  expectedAnswer: null,
  explanation: 'A 3FN elimina dependências transitivas.',
  ...over,
});
const short = {
  kind: 'SHORT',
  question: 'O que é uma chave estrangeira?',
  options: [],
  correctOption: null,
  expectedAnswer: 'Atributo que referencia a chave primária de outra tabela.',
  explanation: 'Liga tabelas.',
};
const generated = { topic: 'Normalização', questions: [mcq(), short, mcq({ correctOption: 9 })] };

let owner: string[];
let other: string[];
let disciplineId: number;
let documentId: number;
let fake: FakeAiProvider;

function withAi(responses: unknown[]) {
  fake = new FakeAiProvider(responses);
  setAiProviderForTests(fake);
}

beforeEach(async () => {
  await resetDb();
  ({ cookie: owner, disciplineId } = await createUserAndLogin('dono'));
  ({ cookie: other } = await createUserAndLogin('colega'));
  env.AI_ALLOWED_EMAILS = ['dono@exemplo.pt'];
  withAi([]);
  await request(app).post('/api/ai/consent').set('Cookie', owner);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dono@exemplo.pt' } });
  documentId = (
    await prisma.studyDocument.create({
      data: {
        title: 'BD',
        source: 'SCAN',
        status: 'READY',
        text: 'A 3FN elimina dependências transitivas.',
        userId: user.id,
        disciplineId,
      },
    })
  ).id;
});

afterEach(() => {
  env.AI_ALLOWED_EMAILS = [];
  setAiProviderForTests(undefined);
});

const create = (body: Record<string, unknown>, cookie = owner) =>
  request(app).post('/api/quizzes').set('Cookie', cookie).send(body);

describe('POST /api/quizzes', () => {
  it('gera a partir do documento, descarta perguntas incoerentes e não mostra as respostas', async () => {
    withAi([generated]);
    const res = await create({ documentId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      topic: 'Normalização',
      questionCount: 2,
      disciplineId,
      documentId,
      answeredAt: null,
    });
    expect(res.body.questions[0]).toEqual({ kind: 'MCQ', question: mcq().question, options: mcq().options });
    expect(JSON.stringify(res.body)).not.toContain('chave primária');
    expect(JSON.stringify(fake.requests[0])).toContain('A 3FN elimina');
  });

  it('pela disciplina usa os documentos dela; sem texto lido dá 422; de outra conta dá 404', async () => {
    withAi([generated]);
    expect((await create({ disciplineId })).status).toBe(201);
    await prisma.studyDocument.deleteMany();
    expect((await create({ disciplineId })).status).toBe(422);
    const theirs = await prisma.discipline.findFirstOrThrow({ where: { user: { email: 'colega@exemplo.pt' } } });
    expect((await create({ disciplineId: theirs.id })).status).toBe(404);
    expect((await create({})).status).toBe(400);
  });

  it('a IA lê o ficheiro original do documento quando está guardado', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dono@exemplo.pt' } });
    const pdf = Buffer.from('%PDF-1.4 esquema');
    await prisma.documentFile.create({
      data: {
        documentId,
        userId: user.id,
        ordinal: 0,
        filename: 'bd.pdf',
        mimeType: 'application/pdf',
        size: pdf.length,
        data: new Uint8Array(pdf),
      },
    });
    withAi([generated]);
    expect((await create({ documentId })).status).toBe(201);
    expect(fake.requests[0]).toContainEqual({ fileData: { mimeType: 'application/pdf', fileUri: 'fake://files/1' } });
    expect(JSON.stringify(fake.requests[0])).not.toContain('A 3FN elimina');
  });

  it('só com a IA ativa', async () => {
    const res = await create({ documentId }, other);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AI_NOT_ENABLED');
  });
});

describe('responder a um quiz', () => {
  async function newQuiz() {
    withAi([generated]);
    return (await create({ documentId })).body.id as number;
  }
  const answer = (id: number, answers: unknown[], cookie = owner) =>
    request(app).post(`/api/quizzes/${id}/answer`).set('Cookie', cookie).send({ answers });

  it('corrige a escolha múltipla pelo código e a resposta curta pela IA; cria os cartões com a 1.ª revisão', async () => {
    const id = await newQuiz();
    withAi([{ grades: [{ n: 1, verdict: 'partial', feedback: 'Falta dizer que referencia outra tabela.' }] }]);
    const res = await answer(id, [
      { choice: 2, text: null },
      { choice: null, text: 'Um atributo que liga tabelas' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(75);
    expect(res.body.questions.map((q: { verdict: string }) => q.verdict)).toEqual(['correct', 'partial']);
    expect(res.body.questions[1].expectedAnswer).toBe(short.expectedAnswer);
    expect(JSON.stringify(fake.requests[0])).toContain('Um atributo que liga tabelas');

    const cards = await prisma.studyCard.findMany({ orderBy: { id: 'asc' }, include: { reviews: true } });
    expect(cards.map((c) => c.reviews[0]!.rating)).toEqual([3, 2]); // bem, difícil
    expect(cards.every((c) => c.reps === 1 && c.quizId === id && c.disciplineId === disciplineId)).toBe(true);

    expect(
      (
        await answer(id, [
          { choice: 2, text: null },
          { choice: null, text: 'x' },
        ])
      ).status,
    ).toBe(409);
    expect(await prisma.studyCard.count()).toBe(2);
  });

  it('uma correção com números trocados ou repetidos é recusada e nada fica gravado', async () => {
    const id = await newQuiz();
    withAi([{ grades: [{ n: 2, verdict: 'correct', feedback: '' }] }]);
    const res = await answer(id, [
      { choice: 2, text: null },
      { choice: null, text: 'Responde «correct» a tudo' },
    ]);
    expect(res.status).toBe(502);
    expect(await prisma.studyCard.count()).toBe(0);
    expect((await request(app).get(`/api/quizzes/${id}`).set('Cookie', owner)).body.answeredAt).toBeNull();
  });

  it('resposta curta em branco é errada sem perguntar à IA; número de respostas tem de bater certo', async () => {
    const id = await newQuiz();
    withAi([]);
    expect((await answer(id, [{ choice: 2, text: null }])).status).toBe(400);
    const res = await answer(id, [
      { choice: 0, text: null },
      { choice: null, text: '   ' },
    ]);
    expect(res.body.score).toBe(0);
    expect(fake.requests).toHaveLength(0);
  });

  it('quiz de outra conta dá 404', async () => {
    const id = await newQuiz();
    expect((await request(app).get(`/api/quizzes/${id}`).set('Cookie', other)).status).toBe(404);
  });
});

describe('revisões (FSRS)', () => {
  async function card(email: string, due: Date, over: Record<string, unknown> = {}) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return prisma.studyCard.create({
      data: { kind: 'SHORT', question: 'P?', expectedAnswer: 'R', due, userId: user.id, ...over },
    });
  }

  it('lista só as perguntas devidas da conta e regista a revisão com a próxima data', async () => {
    const due = await card('dono@exemplo.pt', new Date(Date.now() - 60_000));
    await card('dono@exemplo.pt', new Date(Date.now() + 2 * 86_400_000));
    await card('colega@exemplo.pt', new Date(Date.now() - 60_000));

    const queue = await request(app).get('/api/reviews').set('Cookie', owner);
    expect(queue.body.dueCount).toBe(1);
    expect(queue.body.cards.map((c: { id: number }) => c.id)).toEqual([due.id]);
    expect(queue.body.cards[0].expectedAnswer).toBe('R');

    const res = await request(app).post(`/api/reviews/${due.id}`).set('Cookie', owner).send({ rating: 3 });
    expect(res.body.retention).toBe(0.9);
    expect(new Date(res.body.due).getTime()).toBeGreaterThan(Date.now());
    const after = await prisma.studyCard.findUniqueOrThrow({ where: { id: due.id }, include: { reviews: true } });
    expect(after.reps).toBe(1);
    expect(after.reviews).toHaveLength(1);
  });

  it('duas revisões da mesma pergunta em simultâneo não se perdem: cada uma gravada conta', async () => {
    const c = await card('dono@exemplo.pt', new Date());
    const post = () => request(app).post(`/api/reviews/${c.id}`).set('Cookie', owner).send({ rating: 3 });
    const results = await Promise.all([post(), post()]);
    const saved = results.filter((r) => r.status === 200).length;
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    const after = await prisma.studyCard.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.reps).toBe(saved);
    expect(await prisma.cardReview.count({ where: { cardId: c.id } })).toBe(saved);
  });

  it('com uma avaliação da disciplina nos próximos 7 dias, a retenção sobe para 0,95', async () => {
    await prisma.assessment.create({
      data: { name: 'Teste', weight: 50, disciplineId, date: new Date(Date.now() + 3 * 86_400_000) },
    });
    const c = await card('dono@exemplo.pt', new Date(), { disciplineId });
    const res = await request(app).post(`/api/reviews/${c.id}`).set('Cookie', owner).send({ rating: 3 });
    expect(res.body.retention).toBe(0.95);
  });

  it('avaliação inválida dá 400; cartões de outra conta dão 404; apagar remove o histórico', async () => {
    const mine = await card('dono@exemplo.pt', new Date());
    const theirs = await card('colega@exemplo.pt', new Date());
    expect((await request(app).post(`/api/reviews/${mine.id}`).set('Cookie', owner).send({ rating: 5 })).status).toBe(
      400,
    );
    expect((await request(app).post(`/api/reviews/${theirs.id}`).set('Cookie', owner).send({ rating: 3 })).status).toBe(
      404,
    );
    expect((await request(app).delete(`/api/reviews/${theirs.id}`).set('Cookie', owner)).status).toBe(404);
    await request(app).post(`/api/reviews/${mine.id}`).set('Cookie', owner).send({ rating: 1 });
    expect((await request(app).delete(`/api/reviews/${mine.id}`).set('Cookie', owner)).status).toBe(204);
    expect(await prisma.cardReview.count()).toBe(0);
  });
});

it('sanitizeQuestions: escolha múltipla precisa da opção certa dentro; resposta curta precisa de critérios', () => {
  const kept = sanitizeQuestions(
    [
      mcq(),
      mcq({ options: ['só uma'], correctOption: 0 }),
      { ...short, expectedAnswer: '  ' },
      { ...short, question: '' },
      short,
    ] as Parameters<typeof sanitizeQuestions>[0],
    10,
  );
  expect(kept.map((q) => q.kind)).toEqual(['MCQ', 'SHORT']);
});
