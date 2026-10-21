// Pontuação do conjunto de avaliação «ficha da UC → avaliações» (regras em test/fixtures/fichas-uc/README.md).
// Funções puras: recebem o esperado e o resultado do extrator, sem ficheiros nem rede.
import type { AssessmentType } from '@studentos/shared';
import type { FichaExtraction, ProposedAssessment } from '../../src/lib/fichas-uc/extractor.js';

export interface ExpectedAssessment {
  name: string;
  type: AssessmentType;
  acceptTypes?: AssessmentType[];
  weight: number;
  minScore: number | null;
  date?: null;
}

export interface DatasetCase {
  id: string;
  uc: string;
  difficulty: string;
  split: 'afinacao' | 'retida';
  available: boolean;
  expected: { assessments: ExpectedAssessment[] } | null;
}

export interface Threshold {
  heldOutMinCorrect: number;
  heldOutMaxConfidentErrors: number;
  negativesMustBeRefused: boolean;
}

export interface Dataset {
  evaluation: { threshold: Threshold };
  cases: DatasetCase[];
}

/** certo: proposta igual ao esperado (ou recusa num caso negativo); errado: proposta com erros; recusado: falha. */
export type Outcome = 'certo' | 'errado' | 'recusado';

export interface CaseScore {
  outcome: Outcome;
  expected: number;
  proposed: number;
  /** Acertos por campo, sobre o número de avaliações esperadas. */
  weights: number;
  minScores: number;
  types: number;
  /** Avaliações propostas com data: é sempre um erro, as fichas não têm datas. */
  dates: number;
}

const sameWeight = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const typeOk = (e: ExpectedAssessment, p: ProposedAssessment) =>
  p.type === e.type || (e.acceptTypes ?? []).includes(p.type);
const exact = (e: ExpectedAssessment, p: ProposedAssessment) =>
  sameWeight(e.weight, p.weight) && e.minScore === p.minScore && typeOk(e, p);

/**
 * Há um emparelhamento um-para-um em que cada avaliação esperada tem uma proposta com o mesmo peso, a mesma
 * nota mínima e um tipo aceite? Comparar só os pesos como conjunto deixaria passar 40/60 trocado por 60/40.
 */
function perfectMatch(expected: ExpectedAssessment[], proposed: ProposedAssessment[]): boolean {
  if (expected.length !== proposed.length) return false;
  const used = proposed.map(() => false);
  const match = (i: number): boolean => {
    if (i === expected.length) return true;
    for (let j = 0; j < proposed.length; j++) {
      if (used[j] || !exact(expected[i]!, proposed[j]!)) continue;
      used[j] = true;
      if (match(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return match(0);
}

/** Acertos por campo: cada avaliação esperada fica com a proposta do mesmo peso que mais campos acerta. */
function fieldHits(expected: ExpectedAssessment[], proposed: ProposedAssessment[]) {
  const used = new Set<number>();
  const hits = { weights: 0, minScores: 0, types: 0 };
  for (const e of expected) {
    let best = -1;
    let bestScore = -1;
    proposed.forEach((p, j) => {
      if (used.has(j) || !sameWeight(e.weight, p.weight)) return;
      const score = Number(e.minScore === p.minScore) + Number(typeOk(e, p));
      if (score > bestScore) [best, bestScore] = [j, score];
    });
    if (best < 0) continue;
    used.add(best);
    const p = proposed[best]!;
    hits.weights++;
    if (e.minScore === p.minScore) hits.minScores++;
    if (typeOk(e, p)) hits.types++;
  }
  return hits;
}

/** `expected` é null nos casos negativos (ficha sem programa): aí, a resposta certa é recusar. */
export function scoreCase(expected: ExpectedAssessment[] | null, result: FichaExtraction): CaseScore {
  const proposed = result.ok ? result.assessments : [];
  const dates = proposed.filter((p) => (p as { date?: unknown }).date != null).length;
  const base = { expected: expected?.length ?? 0, proposed: proposed.length, dates };

  if (expected === null) {
    return { ...base, outcome: result.ok ? 'errado' : 'certo', weights: 0, minScores: 0, types: 0 };
  }
  if (!result.ok) return { ...base, outcome: 'recusado', weights: 0, minScores: 0, types: 0 };
  const hits = fieldHits(expected, proposed);
  const outcome = dates === 0 && perfectMatch(expected, proposed) ? 'certo' : 'errado';
  return { ...base, ...hits, outcome };
}

export interface Tally {
  cases: number;
  certo: number;
  errado: number;
  recusado: number;
  expected: number;
  weights: number;
  minScores: number;
  types: number;
}

export function tally(scores: CaseScore[]): Tally {
  const t: Tally = { cases: 0, certo: 0, errado: 0, recusado: 0, expected: 0, weights: 0, minScores: 0, types: 0 };
  for (const s of scores) {
    t.cases++;
    t[s.outcome]++;
    t.expected += s.expected;
    t.weights += s.weights;
    t.minScores += s.minScores;
    t.types += s.types;
  }
  return t;
}

/** Limiar fixado antes de existir extrator. Só é decidido com as retidas. */
export function checkThreshold(
  threshold: Threshold,
  rows: { case: DatasetCase; score: CaseScore }[],
): { passes: boolean; reasons: string[] } {
  const heldOut = tally(rows.filter((r) => r.case.split === 'retida' && r.case.expected).map((r) => r.score));
  const reasons: string[] = [];
  if (heldOut.certo < threshold.heldOutMinCorrect) {
    reasons.push(`Retidas: ${heldOut.certo} de ${heldOut.cases} certas (mínimo ${threshold.heldOutMinCorrect}).`);
  }
  if (heldOut.errado > threshold.heldOutMaxConfidentErrors) {
    reasons.push(`Retidas: ${heldOut.errado} proposta(s) errada(s) (máximo ${threshold.heldOutMaxConfidentErrors}).`);
  }
  if (threshold.negativesMustBeRefused) {
    for (const r of rows.filter((r) => r.case.expected === null && r.score.outcome !== 'certo')) {
      reasons.push(`Caso negativo ${r.case.id}: devia recusar e propôs avaliações.`);
    }
  }
  return { passes: reasons.length === 0, reasons };
}
