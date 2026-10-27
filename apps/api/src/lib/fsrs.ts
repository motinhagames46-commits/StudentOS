// Repetição espaçada com ts-fsrs (FSRS-6, MIT): sem aleatoriedade (fuzz desligado), a mesma revisão dá sempre
// a mesma próxima data. Retenção pedida 0,90; nos dias antes de uma avaliação da disciplina sobe para 0,95.
import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs';

export const RETENTION = 0.9;
export const EXAM_RETENTION = 0.95;
/** Dias antes de uma avaliação em que a retenção sobe (intervalos mais curtos). */
export const EXAM_WINDOW_DAYS = 7;

const schedulers = new Map([
  [RETENTION, fsrs({ request_retention: RETENTION })],
  [EXAM_RETENTION, fsrs({ request_retention: EXAM_RETENTION })],
]);

/** Campos FSRS como estão guardados em StudyCard. */
export interface CardState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
}

export function retentionFor(nextAssessment: Date | null, now: Date): number {
  if (!nextAssessment || nextAssessment <= now) return RETENTION;
  return nextAssessment.getTime() - now.getTime() <= EXAM_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ? EXAM_RETENTION
    : RETENTION;
}

export const newCardState = (now: Date): CardState => fromCard(createEmptyCard(now));

function fromCard(c: Card): CardState {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}

/** Aplica uma revisão (1 errei, 2 difícil, 3 bem, 4 fácil) e devolve o novo estado e o registo. */
export function reviewCard(card: CardState, rating: Grade, now: Date, retention: number) {
  const scheduler = schedulers.get(retention) ?? schedulers.get(RETENTION)!;
  const { card: next, log } = scheduler.next(
    {
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      learning_steps: card.learningSteps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      last_review: card.lastReview ?? undefined,
    },
    now,
    rating,
  );
  return {
    card: fromCard(next),
    log: {
      rating: log.rating,
      state: log.state,
      due: log.due,
      stability: log.stability,
      difficulty: log.difficulty,
      elapsedDays: log.elapsed_days,
      scheduledDays: log.scheduled_days,
      reviewedAt: log.review,
    },
  };
}
