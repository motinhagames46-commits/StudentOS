// Quizzes gerados pela IA a partir dos documentos e revisões com repetição espaçada (FSRS).
// A escolha múltipla é corrigida pelo código; a resposta curta, no quiz, pela IA com os critérios da pergunta.
import { z } from 'zod';

export const QUIZ_MIN_QUESTIONS = 3;
export const QUIZ_MAX_QUESTIONS = 10;

export const quizCreateSchema = z
  .strictObject({
    documentId: z.number().int().positive().nullable().optional(),
    disciplineId: z.number().int().positive().nullable().optional(),
    count: z.number().int().min(QUIZ_MIN_QUESTIONS).max(QUIZ_MAX_QUESTIONS).optional(),
  })
  .refine((i) => Boolean(i.documentId) !== Boolean(i.disciplineId), {
    message: 'Escolhe um documento ou uma disciplina',
    path: ['documentId'],
  });

export const quizAnswerSchema = z.strictObject({
  answers: z
    .array(
      z.strictObject({
        choice: z.number().int().min(0).max(5).nullable(),
        text: z.string().trim().max(2000).nullable(),
      }),
    )
    .min(1)
    .max(QUIZ_MAX_QUESTIONS),
});

/** 1 errei, 2 difícil, 3 bem, 4 fácil (escala do FSRS). */
export const cardReviewSchema = z.strictObject({
  rating: z.number().int().min(1, 'Avaliação inválida').max(4, 'Avaliação inválida'),
});

export type QuizCreateInput = z.infer<typeof quizCreateSchema>;
export type QuizAnswerInput = z.infer<typeof quizAnswerSchema>;
export type QuizVerdict = 'correct' | 'partial' | 'wrong';

/** Pergunta como o estudante a vê antes de responder (sem a resposta). */
export interface QuizQuestionView {
  kind: 'MCQ' | 'SHORT';
  question: string;
  options: string[];
}

/** Depois de corrigido: a resposta certa, a do estudante e o veredicto. */
export interface QuizResultQuestion extends QuizQuestionView {
  correctOption: number | null;
  expectedAnswer: string | null;
  explanation: string;
  answer: { choice: number | null; text: string | null };
  verdict: QuizVerdict;
  feedback: string | null;
}

export interface QuizSummary {
  id: number;
  topic: string;
  createdAt: string;
  answeredAt: string | null;
  /** Percentagem de acerto (resposta parcial vale metade). */
  score: number | null;
  questionCount: number;
  disciplineId: number | null;
  documentId: number | null;
}

export interface QuizView extends QuizSummary {
  questions: QuizQuestionView[] | QuizResultQuestion[];
}

export interface ReviewCardView {
  id: number;
  kind: 'MCQ' | 'SHORT';
  question: string;
  options: string[];
  correctOption: number | null;
  expectedAnswer: string | null;
  explanation: string | null;
  due: string;
  disciplineId: number | null;
}

export interface ReviewQueue {
  cards: ReviewCardView[];
  /** Total devido agora (a lista traz no máximo 50). */
  dueCount: number;
  /** Próxima revisão, quando não há nenhuma devida. */
  nextDue: string | null;
}
