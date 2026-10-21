// Pontuação do conjunto «ficha da UC → avaliações» (scripts/eval-fichas/score.ts).
import { describe, expect, it } from 'vitest';
import {
  checkThreshold,
  scoreCase,
  tally,
  type DatasetCase,
  type ExpectedAssessment,
  type Threshold,
} from '../scripts/eval-fichas/score.js';
import type { FichaExtraction, ProposedAssessment } from '../src/lib/fichas-uc/extractor.js';

const expected: ExpectedAssessment[] = [
  { name: 'Teste teórico', type: 'TEST', weight: 40, minScore: 8, date: null },
  { name: 'Trabalho prático', type: 'ASSIGNMENT', acceptTypes: ['PROJECT'], weight: 60, minScore: 8, date: null },
];
const proposal = (assessments: ProposedAssessment[]): FichaExtraction => ({
  ok: true,
  assessments,
  examRegime: null,
  notes: [],
});
const refusal: FichaExtraction = { ok: false, reason: 'NAO_RECONHECIDA', message: '' };

describe('scoreCase', () => {
  it('proposta igual ao esperado é certa, com outros nomes, outra ordem e um tipo alternativo', () => {
    const s = scoreCase(
      expected,
      proposal([
        { name: 'Projeto', type: 'PROJECT', weight: 60, minScore: 8 },
        { name: 'Frequência', type: 'TEST', weight: 40, minScore: 8 },
      ]),
    );
    expect(s).toMatchObject({ outcome: 'certo', weights: 2, minScores: 2, types: 2, dates: 0 });
  });

  it('pesos trocados entre o teste e o trabalho são um erro, mesmo somando 100', () => {
    const s = scoreCase(
      expected,
      proposal([
        { name: 'Teste teórico', type: 'TEST', weight: 60, minScore: 8 },
        { name: 'Trabalho prático', type: 'ASSIGNMENT', weight: 40, minScore: 8 },
      ]),
    );
    expect(s.outcome).toBe('errado');
    expect(s.types).toBe(0);
  });

  it('nota mínima inventada, avaliação em falta ou data são erros', () => {
    const invented = scoreCase(
      expected.map((e) => ({ ...e, minScore: null })),
      proposal(expected.map(({ name, type, weight }) => ({ name, type, weight, minScore: 8 }))),
    );
    expect(invented).toMatchObject({ outcome: 'errado', weights: 2, minScores: 0 });

    expect(scoreCase(expected, proposal([{ name: 'Teste', type: 'TEST', weight: 40, minScore: 8 }]))).toMatchObject({
      outcome: 'errado',
      weights: 1,
    });

    const withDate = {
      name: 'Teste',
      type: 'TEST' as const,
      weight: 40,
      minScore: 8,
      date: '2026-11-10T09:00:00.000Z',
    };
    const dated = scoreCase(
      expected,
      proposal([withDate, { name: 'Trabalho prático', type: 'ASSIGNMENT', weight: 60, minScore: 8 }]),
    );
    expect(dated).toMatchObject({ outcome: 'errado', dates: 1 });
  });

  it('recusar um caso com avaliações é «recusado»; num caso negativo, recusar é o certo', () => {
    expect(scoreCase(expected, refusal).outcome).toBe('recusado');
    expect(scoreCase(null, refusal).outcome).toBe('certo');
    expect(scoreCase(null, proposal([{ name: 'Exame', type: 'EXAM', weight: 100, minScore: null }])).outcome).toBe(
      'errado',
    );
  });
});

describe('checkThreshold', () => {
  const threshold: Threshold = { heldOutMinCorrect: 4, heldOutMaxConfidentErrors: 0, negativesMustBeRefused: true };
  const heldOut = (id: string): DatasetCase => ({
    id,
    uc: id,
    difficulty: 'fácil',
    split: 'retida',
    available: true,
    expected: { assessments: expected },
  });
  const negative: DatasetCase = { ...heldOut('sem-programa'), split: 'afinacao', available: false, expected: null };
  const right = scoreCase(expected, proposal(expected));
  const wrong = scoreCase(expected, proposal([{ name: 'Exame', type: 'EXAM', weight: 100, minScore: null }]));

  it('passa com 4 de 5 retidas certas, nenhum erro e o negativo recusado', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => ({ case: heldOut(id), score: right })),
      { case: heldOut('e'), score: scoreCase(expected, refusal) },
      { case: negative, score: scoreCase(null, refusal) },
    ];
    expect(checkThreshold(threshold, rows)).toEqual({ passes: true, reasons: [] });
  });

  it('não passa com um erro confiante nas retidas, nem com o negativo aceite', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => ({ case: heldOut(id), score: right })),
      { case: heldOut('e'), score: wrong },
      { case: negative, score: scoreCase(null, proposal(expected)) },
    ];
    const verdict = checkThreshold(threshold, rows);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons).toHaveLength(2);
  });

  it('a linha de base (tudo recusado) não passa, mas não comete erros', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ case: heldOut(id), score: scoreCase(expected, refusal) }));
    expect(tally(rows.map((r) => r.score))).toMatchObject({ certo: 0, errado: 0, recusado: 5 });
    expect(checkThreshold(threshold, rows).passes).toBe(false);
  });
});
