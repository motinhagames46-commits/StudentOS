import { describe, it, expect } from 'vitest';
import { computeGrades, requiredScore, globalAverage, roundFinal, exceedsWeightLimit, isAtRisk } from './grades.js';

// Exemplo da secção 4.1 da especificação — Programação Web
const pw = [
  { weight: 30, score: 12 },
  { weight: 30, score: 15 },
  { weight: 40, score: null, minScore: 8 },
];

describe('computeGrades', () => {
  it('média atual considera só avaliações com nota (RN04)', () => {
    const g = computeGrades(pw);
    expect(g.currentAverage).toBe(13.5);
    expect(g.status).toBe('in-progress');
    expect(g.finalGrade).toBeNull();
  });

  it('sem avaliações não há média', () => {
    expect(computeGrades([])).toMatchObject({ status: 'no-assessments', currentAverage: null });
  });

  it('pesos abaixo de 100% marcam configuração incompleta (RN03)', () => {
    expect(computeGrades([{ weight: 60, score: 14 }]).status).toBe('incomplete-config');
  });

  it('média final arredonda ≥ x,5 para cima e aprova com ≥ 10 (RN05, RN06)', () => {
    const g = computeGrades([
      { weight: 50, score: 9 },
      { weight: 50, score: 10 },
    ]);
    expect(g.finalAverage).toBe(9.5);
    expect(g.finalGrade).toBe(10);
    expect(g.status).toBe('approved');
  });

  it('reprova se uma componente ficar abaixo da nota mínima, mesmo com média ≥ 10 (RN06)', () => {
    const g = computeGrades([
      { weight: 60, score: 18 },
      { weight: 40, score: 7, minScore: 8 },
    ]);
    expect(g.finalGrade).toBe(14);
    expect(g.status).toBe('failed');
    expect(g.failedMinimums).toBe(1);
  });

  it('respeita a nota de aprovação da disciplina', () => {
    const items = [{ weight: 100, score: 11 }];
    expect(computeGrades(items, 12).status).toBe('failed');
  });
});

describe('requiredScore (RN07)', () => {
  it('para passar, respeita a nota mínima do exame', () => {
    expect(requiredScore(pw, 10)).toEqual({ status: 'needed', value: 8 });
  });

  it('sem nota mínima, para passar basta 3,5', () => {
    const noMin = pw.map((a) => ({ ...a, minScore: null }));
    expect(requiredScore(noMin, 10)).toEqual({ status: 'needed', value: 3.5 });
  });

  it('para ter 14 precisa de 13,5', () => {
    expect(requiredScore(pw, 14)).toEqual({ status: 'needed', value: 13.5 });
  });

  it('20 é impossível', () => {
    expect(requiredScore(pw, 20)).toEqual({ status: 'impossible', reason: 'above-max' });
  });

  it('já garantido quando a contribuição atual chega', () => {
    const items = [
      { weight: 80, score: 15 },
      { weight: 20, score: null },
    ];
    expect(requiredScore(items, 10)).toEqual({ status: 'secured' });
  });

  it('impossível se uma componente já avaliada falhou a nota mínima', () => {
    const items = [
      { weight: 50, score: 5, minScore: 8 },
      { weight: 50, score: null },
    ];
    expect(requiredScore(items, 10)).toEqual({ status: 'impossible', reason: 'failed-minimum' });
  });

  it('exige configuração completa e avaliações pendentes', () => {
    expect(requiredScore([{ weight: 50, score: null }], 10)).toEqual({ status: 'incomplete-config' });
    expect(requiredScore([{ weight: 100, score: 12 }], 10)).toEqual({ status: 'no-pending' });
  });

  it('arredonda para cima à centésima', () => {
    const items = [
      { weight: 34, score: 10 },
      { weight: 66, score: null },
    ];
    // (950 − 340) / 66 = 9,2424… → 9,25
    expect(requiredScore(items, 10)).toEqual({ status: 'needed', value: 9.25 });
  });

  it('rejeita notas-alvo fora da escala', () => {
    expect(() => requiredScore(pw, 21)).toThrow(RangeError);
  });
});

describe('globalAverage (RN08)', () => {
  it('pondera por ECTS só as disciplinas aprovadas', () => {
    const r = globalAverage([
      { finalGrade: 14, ects: 6, approved: true },
      { finalGrade: 12, ects: 3, approved: true },
      { finalGrade: 8, ects: 6, approved: false },
    ]);
    expect(r).toEqual({ average: 13.33, credits: 9, missingEcts: false });
  });

  it('assinala disciplinas sem ECTS', () => {
    expect(globalAverage([{ finalGrade: 15, ects: null, approved: true }]).missingEcts).toBe(true);
  });
});

describe('utilitários', () => {
  it('roundFinal', () => {
    expect(roundFinal(9.49)).toBe(9);
    expect(roundFinal(9.5)).toBe(10);
  });
  it('exceedsWeightLimit', () => {
    expect(exceedsWeightLimit(70, 30)).toBe(false);
    expect(exceedsWeightLimit(70, 40)).toBe(true);
  });
});

describe('isAtRisk — disciplina em curso com média abaixo da aprovação', () => {
  it('8,5 com metade por avaliar está em risco (arredonda a 9 < 10)', () => {
    const g = computeGrades([
      { weight: 50, score: 8.5 },
      { weight: 50, score: null },
    ]);
    expect(isAtRisk(g)).toBe(true);
  });
  it('9,5 já arredonda a 10: não está em risco', () => {
    const g = computeGrades([
      { weight: 50, score: 9.5 },
      { weight: 50, score: null },
    ]);
    expect(isAtRisk(g)).toBe(false);
  });
  it('respeita a nota de aprovação da disciplina', () => {
    const g = computeGrades(
      [
        { weight: 50, score: 11 },
        { weight: 50, score: null },
      ],
      12,
    );
    expect(isAtRisk(g, 12)).toBe(true);
  });
  it('sem notas, concluída ou com pesos incompletos não é «em risco»', () => {
    expect(isAtRisk(computeGrades([{ weight: 100, score: null }]))).toBe(false);
    expect(isAtRisk(computeGrades([{ weight: 100, score: 8 }]))).toBe(false); // já reprovada, não «em risco»
    expect(isAtRisk(computeGrades([{ weight: 60, score: 5 }]))).toBe(false);
  });
});
