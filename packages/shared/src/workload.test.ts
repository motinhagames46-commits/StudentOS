import { describe, expect, it } from 'vitest';
import { ectsPace, ectsPaceNote, formatStudyMinutes, type EctsPaceInput } from './workload.js';

const SEMESTER = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2027-01-31T00:00:00Z') }; // 153 dias
const NOW = new Date('2026-10-19T07:00:00Z');
const WEEK = { from: NOW, to: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000) };

const base: EctsPaceInput = {
  ects: 6,
  contactMinutes: 60 * 60,
  weightPercent: 40,
  semester: SEMESTER,
  assessmentDate: null,
  window: WEEK,
  now: NOW,
  doneTotalMinutes: 0,
  doneInWindowMinutes: 0,
};
const ok = (input: EctsPaceInput) => {
  const p = ectsPace(input);
  if (!p.ok) throw new Error(`esperava ritmo, veio ${p.missing}`);
  return p;
};

describe('ritmo pelos ECTS (DL 42/2005: 25 h por ECTS)', () => {
  it('6 ECTS − 60 h de aulas = 90 h autónomas; 40 % → 36 h repartidas pelo semestre', () => {
    const p = ok(base);
    expect(p.autonomousMinutes).toBe(90 * 60);
    expect(p.budgetMinutes).toBe(36 * 60);
    // 2160 min ÷ 153 dias × 7 dias = 98,8 → 99 min nesta semana
    expect(p.quotaMinutes).toBe(99);
    expect(p.weeklyMinutes).toBe(99);
  });

  it('com data marcada, o mesmo orçamento é repartido até à data (sem pico)', () => {
    const p = ok({ ...base, assessmentDate: new Date('2026-11-15T09:00:00Z') });
    // 75,4 dias desde 1/9 → 28,7 min/dia → 7 dias ≈ 201 min
    expect(p.quotaMinutes).toBeGreaterThan(195);
    expect(p.quotaMinutes).toBeLessThan(205);
    expect(p.until.toISOString()).toBe('2026-11-15T09:00:00.000Z');
  });

  it('só conta os dias do período até à data da avaliação', () => {
    const p = ok({ ...base, assessmentDate: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000) });
    const full = ok({ ...base, assessmentDate: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000) });
    expect(p.quotaMinutes).toBeLessThan(full.quotaMinutes);
  });

  it('desconta o já estudado no período e nunca ultrapassa o orçamento; não acumula semanas perdidas', () => {
    expect(ok({ ...base, doneInWindowMinutes: 60 }).quotaMinutes).toBe(39);
    expect(ok({ ...base, doneInWindowMinutes: 500 }).quotaMinutes).toBe(0);
    expect(ok({ ...base, doneTotalMinutes: 36 * 60 - 20 }).quotaMinutes).toBe(20);
    // A meio do semestre, sem nada estudado, a quota da semana é a mesma do início (ritmo fixo).
    const later = new Date('2026-12-01T07:00:00Z');
    expect(
      ok({ ...base, now: later, window: { from: later, to: new Date(later.getTime() + 7 * 864e5) } }).quotaMinutes,
    ).toBe(99);
  });

  it('aulas que cobrem as horas da UC deixam zero horas autónomas', () => {
    const p = ok({ ...base, ects: 3, contactMinutes: 100 * 60 });
    expect(p.autonomousMinutes).toBe(0);
    expect(p.quotaMinutes).toBe(0);
  });

  it('diz o que falta em vez de inventar', () => {
    expect(ectsPace({ ...base, ects: null })).toEqual({ ok: false, missing: 'ECTS' });
    expect(ectsPace({ ...base, semester: null })).toEqual({ ok: false, missing: 'SEMESTER' });
    const after = new Date('2027-02-03T10:00:00Z');
    expect(ectsPace({ ...base, now: after, window: { from: after, to: new Date(after.getTime() + 864e5) } })).toEqual({
      ok: false,
      missing: 'SEMESTER_OVER',
    });
  });

  it('explica a conta só com números do sistema', () => {
    const p = ok(base);
    expect(ectsPaceNote({ ...base, contactEstimated: false }, p, 'Europe/Lisbon')).toBe(
      '6 ECTS × 25 h − 60 h de aulas = 90 h; 40 % → 36 h até 31/01 ≈ 1 h 39/semana',
    );
    expect(ectsPaceNote({ ...base, contactEstimated: true }, p, 'Europe/Lisbon')).toMatch(/− ~60 h de aulas/);
    expect(formatStudyMinutes(45)).toBe('45 min');
    expect(formatStudyMinutes(100)).toBe('1 h 40');
  });
});
