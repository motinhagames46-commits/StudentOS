import { describe, expect, it } from 'vitest';
import { formatStudyMinutes, paceNote, studyPace, type PaceInput } from './workload.js';

const SEMESTER = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2027-01-31T00:00:00Z') }; // 153 dias
const NOW = new Date('2026-10-19T07:00:00Z');
const WEEK = { from: NOW, to: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000) };

const base: PaceInput = {
  weightPercent: 40,
  semester: SEMESTER,
  assessmentDate: null,
  window: WEEK,
  now: NOW,
  doneTotalMinutes: 0,
  doneInWindowMinutes: 0,
};
const ok = (input: PaceInput) => {
  const p = studyPace(input);
  if (!p.ok) throw new Error(`esperava ritmo, veio ${p.missing}`);
  return p;
};

describe('ritmo predefinido (60 h por disciplina, sem ECTS)', () => {
  it('40 % de 60 h = 24 h repartidas pelo semestre', () => {
    const p = ok(base);
    expect(p.budgetMinutes).toBe(24 * 60);
    // 1440 min ÷ 153 dias × 7 dias = 65,9 → 66 min nesta semana
    expect(p.quotaMinutes).toBe(66);
    expect(p.weeklyMinutes).toBe(66);
  });

  it('avaliação marcada antes do início do semestre: reparte desde hoje até à data, sem ritmo inflacionado', () => {
    // Semestre seguinte (começa a 15/2), mas a avaliação ficou a 25/1: dado incoerente, ainda assim por fazer.
    const next = { start: new Date('2027-02-15T00:00:00Z'), end: new Date('2027-06-30T00:00:00Z') };
    const p = ok({ ...base, semester: next, assessmentDate: new Date('2027-01-25T09:00:00Z') });
    // 1440 min ÷ 98,1 dias (de 19/10 a 25/1) ≈ 14,7 min/dia → ≈ 103 min por semana, e esta semana tem quota.
    expect(p.weeklyMinutes).toBeGreaterThan(100);
    expect(p.weeklyMinutes).toBeLessThan(106);
    // A quota arredonda para cima e o ritmo semanal ao minuto: a diferença é no máximo 1.
    expect(Math.abs(p.quotaMinutes - p.weeklyMinutes)).toBeLessThanOrEqual(1);
  });

  it('com data marcada, o mesmo orçamento é repartido até à data (sem pico)', () => {
    const p = ok({ ...base, assessmentDate: new Date('2026-11-15T09:00:00Z') });
    // 75,4 dias desde 1/9 → 19,1 min/dia → 7 dias ≈ 134 min
    expect(p.quotaMinutes).toBeGreaterThan(130);
    expect(p.quotaMinutes).toBeLessThan(138);
    expect(p.until.toISOString()).toBe('2026-11-15T09:00:00.000Z');
  });

  it('só conta os dias do período até à data da avaliação', () => {
    const p = ok({ ...base, assessmentDate: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000) });
    const full = ok({ ...base, assessmentDate: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000) });
    expect(p.quotaMinutes).toBeLessThan(full.quotaMinutes);
  });

  it('desconta o já estudado no período e nunca ultrapassa o orçamento; não acumula semanas perdidas', () => {
    expect(ok({ ...base, doneInWindowMinutes: 60 }).quotaMinutes).toBe(6);
    expect(ok({ ...base, doneInWindowMinutes: 500 }).quotaMinutes).toBe(0);
    expect(ok({ ...base, doneTotalMinutes: 24 * 60 - 20 }).quotaMinutes).toBe(20);
    // A meio do semestre, sem nada estudado, a quota da semana é a mesma do início (ritmo fixo).
    const later = new Date('2026-12-01T07:00:00Z');
    expect(
      ok({ ...base, now: later, window: { from: later, to: new Date(later.getTime() + 7 * 864e5) } }).quotaMinutes,
    ).toBe(66);
  });

  it('diz o que falta em vez de inventar', () => {
    expect(studyPace({ ...base, semester: null })).toEqual({ ok: false, missing: 'SEMESTER' });
    const after = new Date('2027-02-03T10:00:00Z');
    expect(studyPace({ ...base, now: after, window: { from: after, to: new Date(after.getTime() + 864e5) } })).toEqual({
      ok: false,
      missing: 'SEMESTER_OVER',
    });
  });

  it('explica a conta só com números do sistema', () => {
    const p = ok(base);
    expect(paceNote(40, p, 'Europe/Lisbon')).toBe('40 % de 60 h → 24 h até 31/01 ≈ 1 h 06/semana');
    expect(formatStudyMinutes(45)).toBe('45 min');
    expect(formatStudyMinutes(100)).toBe('1 h 40');
  });
});
