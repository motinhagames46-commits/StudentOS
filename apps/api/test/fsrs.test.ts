import { describe, expect, it } from 'vitest';
import { EXAM_RETENTION, RETENTION, newCardState, retentionFor, reviewCard } from '../src/lib/fsrs.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-27T10:00:00Z');

describe('repetição espaçada (FSRS)', () => {
  it('retenção 0,95 só nos 7 dias antes de uma avaliação futura', () => {
    expect(retentionFor(null, now)).toBe(RETENTION);
    expect(retentionFor(new Date(now.getTime() + 3 * DAY), now)).toBe(EXAM_RETENTION);
    expect(retentionFor(new Date(now.getTime() + 8 * DAY), now)).toBe(RETENTION);
    expect(retentionFor(new Date(now.getTime() - DAY), now)).toBe(RETENTION);
  });

  it('é determinística: a mesma revisão dá sempre a mesma data; errar volta a pôr a pergunta para breve', () => {
    const first = reviewCard(newCardState(now), 3, now, RETENTION);
    expect(reviewCard(newCardState(now), 3, now, RETENTION)).toEqual(first);
    expect(first.card.reps).toBe(1);
    expect(first.log.rating).toBe(3);

    const again = reviewCard(newCardState(now), 1, now, RETENTION);
    expect(again.card.due.getTime()).toBeLessThan(first.card.due.getTime());
  });

  it('perto de uma avaliação os intervalos ficam mais curtos', () => {
    // Uma pergunta já em revisão (passou da fase de aprendizagem).
    let card = newCardState(now);
    let t = now;
    for (let i = 0; i < 3; i++) {
      card = reviewCard(card, 3, t, RETENTION).card;
      t = card.due;
    }
    const normal = reviewCard(card, 3, t, RETENTION).card.scheduledDays;
    const exam = reviewCard(card, 3, t, EXAM_RETENTION).card.scheduledDays;
    expect(exam).toBeLessThan(normal);
  });
});
