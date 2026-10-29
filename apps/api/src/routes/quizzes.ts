// Quizzes (passo 4 da IA) e revisões com repetição espaçada. Responder a um quiz é a primeira revisão de cada
// pergunta: as perguntas passam a cartões FSRS. As revisões diárias não usam IA (autoavaliação na resposta curta).
import { Router } from 'express';
import {
  DEFAULT_TIMEZONE,
  addDaysToKey,
  cardReviewSchema,
  idParamSchema,
  quizAnswerSchema,
  quizCreateSchema,
  startOfZonedDay,
  zonedDayKey,
  type QuizResultQuestion,
  type QuizSummary,
  type QuizVerdict,
  type QuizView,
  type ReviewCardView,
  type ReviewQueue,
} from '@studentos/shared';
import type { Grade } from 'ts-fsrs';
import { aiProvider } from '../ai/access.js';
import { documentParts } from '../ai/document-parts.js';
import { generateQuiz, gradeShortAnswers, type StoredQuestion } from '../ai/quiz.js';
import type { Quiz, StudyCard } from '../generated/prisma/client.js';
import { newCardState, retentionFor, reviewCard } from '../lib/fsrs.js';
import { HttpError, notFound, parse, validationError } from '../lib/http.js';
import { findOwnedDiscipline } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';
import { requireAi } from '../middleware/ai.js';

export const quizzesRouter = Router();
export const reviewsRouter = Router();

/** Documentos de uma disciplina lidos num quiz (os mais recentes; os ficheiros entram enquanto couberem). */
const MAX_QUIZ_DOCUMENTS = 5;
const DEFAULT_QUESTIONS = 5;
const RATING: Record<QuizVerdict, Grade> = { correct: 3, partial: 2, wrong: 1 };

type StoredQuiz = (StoredQuestion | QuizResultQuestion)[];

function summary(quiz: Quiz): QuizSummary {
  return {
    id: quiz.id,
    topic: quiz.topic,
    createdAt: quiz.createdAt.toISOString(),
    answeredAt: quiz.answeredAt?.toISOString() ?? null,
    score: quiz.score,
    questionCount: (quiz.questions as unknown as StoredQuiz).length,
    disciplineId: quiz.disciplineId,
    documentId: quiz.documentId,
  };
}

/** Antes de responder, as respostas certas e as explicações não saem do servidor. */
function view(quiz: Quiz): QuizView {
  const questions = quiz.questions as unknown as StoredQuiz;
  return {
    ...summary(quiz),
    questions: quiz.answeredAt
      ? (questions as QuizResultQuestion[])
      : questions.map(({ kind, question, options }) => ({ kind, question, options })),
  };
}

async function findOwnedQuiz(userId: number, id: number) {
  const quiz = await prisma.quiz.findFirst({ where: { id, userId } });
  if (!quiz) throw notFound('QUIZ_NOT_FOUND', 'Quiz não encontrado');
  return quiz;
}

/** Próxima avaliação futura de cada disciplina (para a retenção 0,95 nos dias antes). */
async function nextAssessments(userId: number, disciplineIds: (number | null)[], now: Date) {
  const ids = [...new Set(disciplineIds.filter((x): x is number => x !== null))];
  if (ids.length === 0) return new Map<number, Date>();
  const rows = await prisma.assessment.findMany({
    where: { disciplineId: { in: ids }, discipline: { userId }, date: { gt: now } },
    orderBy: { date: 'asc' },
    select: { disciplineId: true, date: true },
  });
  const next = new Map<number, Date>();
  for (const r of rows) if (!next.has(r.disciplineId)) next.set(r.disciplineId, r.date!);
  return next;
}

// POST /api/quizzes — gera um quiz a partir de um documento ou dos documentos de uma disciplina.
quizzesRouter.post('/', requireAi, async (req, res) => {
  const input = parse(quizCreateSchema, req.body);
  // Só documentos já lidos; de uma disciplina, os mais recentes (a IA lê os ficheiros originais).
  const where = input.documentId
    ? { id: input.documentId, userId: req.userId }
    : { userId: req.userId, disciplineId: (await findOwnedDiscipline(req.userId, input.disciplineId!)).id };
  const docs = await prisma.studyDocument.findMany({
    where: { ...where, status: 'READY' },
    orderBy: { createdAt: 'desc' },
    take: MAX_QUIZ_DOCUMENTS,
    select: { id: true, title: true, text: true, disciplineId: true },
  });
  if (input.documentId && docs.length === 0) {
    const exists = await prisma.studyDocument.count({ where });
    if (!exists) throw notFound('DOCUMENT_NOT_FOUND', 'Documento não encontrado');
  }
  if (docs.length === 0) {
    throw new HttpError(
      422,
      'NO_STUDY_TEXT',
      'Ainda não há documentos lidos para fazer um quiz. Lê um documento primeiro.',
    );
  }
  const disciplineId = input.documentId ? docs[0]!.disciplineId : input.disciplineId!;
  const parts = await documentParts(
    aiProvider()!,
    req.userId,
    docs.map((d) => ({ id: d.id, title: d.title, fallbackText: d.text })),
  );

  const generated = await generateQuiz(aiProvider()!, parts, input.count ?? DEFAULT_QUESTIONS);
  if (generated.questions.length === 0) {
    throw new HttpError(502, 'AI_INVALID_RESPONSE', 'A IA não devolveu perguntas válidas. Tenta outra vez.');
  }
  const quiz = await prisma.quiz.create({
    data: {
      topic: generated.topic,
      questions: generated.questions as object[],
      userId: req.userId,
      disciplineId,
      documentId: input.documentId ?? null,
    },
  });
  res.status(201).json(view(quiz));
});

quizzesRouter.get('/', async (req, res) => {
  const quizzes = await prisma.quiz.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(quizzes.map(summary));
});

quizzesRouter.get('/:id', async (req, res) => {
  res.json(view(await findOwnedQuiz(req.userId, parse(idParamSchema, req.params.id))));
});

// POST /api/quizzes/:id/answer — corrige (escolha múltipla pelo código, resposta curta pela IA) e cria os cartões.
quizzesRouter.post('/:id/answer', requireAi, async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { answers } = parse(quizAnswerSchema, req.body);
  const quiz = await findOwnedQuiz(req.userId, id);
  if (quiz.answeredAt) throw new HttpError(409, 'QUIZ_ALREADY_ANSWERED', 'Este quiz já foi corrigido.');
  const questions = quiz.questions as unknown as StoredQuestion[];
  if (answers.length !== questions.length) {
    throw validationError([{ path: 'answers', message: 'Responde (ou deixa em branco) a todas as perguntas' }]);
  }

  // shortcut: a correção pela IA corre antes de reclamar o quiz; dois envios em simultâneo pagam dois pedidos à IA
  // (só um grava). O botão fica desativado enquanto corrige; um marcador «a corrigir» resolve se for preciso.
  const shortIndexes = questions.flatMap((q, i) => (q.kind === 'SHORT' ? [i] : []));
  const shortGrades = await gradeShortAnswers(
    aiProvider()!,
    shortIndexes.map((i) => ({
      question: questions[i]!.question,
      expectedAnswer: questions[i]!.expectedAnswer ?? '',
      answer: answers[i]!.text ?? '',
    })),
  );
  const results: QuizResultQuestion[] = questions.map((q, i) => {
    const answer = { choice: answers[i]!.choice, text: answers[i]!.text };
    if (q.kind === 'MCQ') {
      return { ...q, answer, verdict: answer.choice === q.correctOption ? 'correct' : 'wrong', feedback: null };
    }
    const grade = shortGrades[shortIndexes.indexOf(i)]!;
    return { ...q, answer, verdict: grade.verdict, feedback: grade.feedback };
  });
  const points = results.reduce((sum, r) => sum + (r.verdict === 'correct' ? 1 : r.verdict === 'partial' ? 0.5 : 0), 0);
  const score = Math.round((points / results.length) * 100);

  const now = new Date();
  const retention = retentionFor(
    (await nextAssessments(req.userId, [quiz.disciplineId], now)).get(quiz.disciplineId ?? -1) ?? null,
    now,
  );
  const answered = await prisma.$transaction(async (tx) => {
    // Reclama o quiz antes de criar os cartões: duas correções em simultâneo não os duplicam.
    const claimed = await tx.quiz.updateMany({
      where: { id, userId: req.userId, answeredAt: null },
      data: { answeredAt: now, score, questions: results as object[] },
    });
    if (!claimed.count) throw new HttpError(409, 'QUIZ_ALREADY_ANSWERED', 'Este quiz já foi corrigido.');
    for (const r of results) {
      const { card, log } = reviewCard(newCardState(now), RATING[r.verdict], now, retention);
      await tx.studyCard.create({
        data: {
          kind: r.kind,
          question: r.question,
          options: r.options,
          correctOption: r.correctOption,
          expectedAnswer: r.expectedAnswer,
          explanation: r.explanation,
          ...card,
          userId: req.userId,
          disciplineId: quiz.disciplineId,
          documentId: quiz.documentId,
          quizId: quiz.id,
          reviews: { create: { ...log, userId: req.userId } },
        },
      });
    }
    return tx.quiz.findUniqueOrThrow({ where: { id } });
  });
  res.json(view(answered));
});

function cardView(card: StudyCard): ReviewCardView {
  return {
    id: card.id,
    kind: card.kind,
    question: card.question,
    options: card.options,
    correctOption: card.correctOption,
    expectedAnswer: card.expectedAnswer,
    explanation: card.explanation,
    due: card.due.toISOString(),
    disciplineId: card.disciplineId,
  };
}

// GET /api/reviews — perguntas devidas até ao fim de hoje (o mesmo limite do planeador), as mais atrasadas primeiro.
reviewsRouter.get('/', async (req, res) => {
  const endOfToday = startOfZonedDay(addDaysToKey(zonedDayKey(new Date(), DEFAULT_TIMEZONE), 1), DEFAULT_TIMEZONE);
  const where = { userId: req.userId, due: { lt: endOfToday } };
  const [cards, dueCount, next] = await Promise.all([
    prisma.studyCard.findMany({ where, orderBy: [{ due: 'asc' }, { id: 'asc' }], take: 50 }),
    prisma.studyCard.count({ where }),
    prisma.studyCard.findFirst({ where: { userId: req.userId, due: { gte: endOfToday } }, orderBy: { due: 'asc' } }),
  ]);
  const queue: ReviewQueue = { cards: cards.map(cardView), dueCount, nextDue: next?.due.toISOString() ?? null };
  res.json(queue);
});

async function findOwnedCard(userId: number, id: number) {
  const card = await prisma.studyCard.findFirst({ where: { id, userId } });
  if (!card) throw notFound('CARD_NOT_FOUND', 'Pergunta não encontrada');
  return card;
}

// POST /api/reviews/:id — regista a revisão e agenda a próxima (FSRS).
reviewsRouter.post('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { rating } = parse(cardReviewSchema, req.body);
  const card = await findOwnedCard(req.userId, id);
  const now = new Date();
  const next = await nextAssessments(req.userId, [card.disciplineId], now);
  const retention = retentionFor(next.get(card.disciplineId ?? -1) ?? null, now);
  const { card: state, log } = reviewCard(card, rating as Grade, now, retention);
  await prisma.$transaction(async (tx) => {
    // Só grava se ninguém a reviu entretanto (outro separador, pedido repetido): sem revisões perdidas.
    const { count } = await tx.studyCard.updateMany({
      where: { id, userId: req.userId, reps: card.reps },
      data: state,
    });
    if (!count) throw new HttpError(409, 'CARD_ALREADY_REVIEWED', 'Esta pergunta acabou de ser revista.');
    await tx.cardReview.create({ data: { ...log, cardId: id, userId: req.userId } });
  });
  res.json({ due: state.due.toISOString(), retention });
});

// DELETE /api/reviews/:id — apaga uma pergunta (por exemplo, mal feita pela IA) e o histórico dela.
reviewsRouter.delete('/:id', async (req, res) => {
  const card = await findOwnedCard(req.userId, parse(idParamSchema, req.params.id));
  await prisma.studyCard.delete({ where: { id: card.id } });
  res.status(204).end();
});
