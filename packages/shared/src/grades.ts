// Motor de cálculo de médias — implementa as regras RN01–RN08 da especificação (secção 4).
// É usado pelo servidor (validação e respostas da API) e pelo cliente (simulador sem pedidos à API).

export const MAX_GRADE = 20;
export const DEFAULT_PASSING_GRADE = 10;

const EPS = 1e-9;

export interface GradeItem {
  weight: number; // percentagem (RN02)
  score: number | null; // null = avaliação pendente
  minScore?: number | null; // nota mínima da componente (RN06)
}

export type GradeStatus =
  | 'no-assessments'
  | 'incomplete-config' // soma dos pesos < 100% (RN03)
  | 'in-progress' // há avaliações pendentes
  | 'approved'
  | 'failed';

export interface GradeSummary {
  weightSum: number;
  gradedWeight: number;
  currentAverage: number | null; // RN04
  finalAverage: number | null; // RN05, sem arredondamento às unidades
  finalGrade: number | null; // RN05, arredondada às unidades
  status: GradeStatus;
  failedMinimums: number; // n.º de componentes abaixo da nota mínima
}

export type RequiredScore =
  | { status: 'needed'; value: number }
  | { status: 'secured' }
  | { status: 'impossible'; reason: 'above-max' | 'failed-minimum' }
  | { status: 'no-pending' }
  | { status: 'incomplete-config' };

export const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

/** Arredonda às unidades com ≥ x,5 para cima (RN05). */
export const roundFinal = (x: number): number => Math.floor(x + 0.5 + EPS);

const ceil2 = (x: number): number => Math.ceil(x * 100 - EPS) / 100;

export function weightSum(items: readonly GradeItem[]): number {
  return round2(items.reduce((sum, a) => sum + a.weight, 0));
}

function isGraded(a: GradeItem): a is GradeItem & { score: number } {
  return a.score !== null && a.score !== undefined;
}

function belowMinimum(a: GradeItem & { score: number }): boolean {
  return a.minScore != null && a.score < a.minScore - EPS;
}

/** Pesos válidos para adicionar/alterar uma avaliação: a soma não pode exceder 100% (RN03). */
export function exceedsWeightLimit(currentSum: number, newWeight: number): boolean {
  return currentSum + newWeight > 100 + EPS;
}

export function computeGrades(
  items: readonly GradeItem[],
  passingGrade: number = DEFAULT_PASSING_GRADE,
): GradeSummary {
  const total = weightSum(items);
  const graded = items.filter(isGraded);
  const gradedWeight = round2(graded.reduce((s, a) => s + a.weight, 0));
  const contribution = graded.reduce((s, a) => s + a.score * a.weight, 0);
  const failedMinimums = graded.filter(belowMinimum).length;

  if (items.length === 0) {
    return {
      weightSum: 0,
      gradedWeight: 0,
      currentAverage: null,
      finalAverage: null,
      finalGrade: null,
      status: 'no-assessments',
      failedMinimums: 0,
    };
  }

  const currentAverage = gradedWeight > 0 ? round2(contribution / gradedWeight) : null;
  const configComplete = Math.abs(total - 100) < EPS;
  const allGraded = graded.length === items.length;
  const complete = configComplete && allGraded;

  const finalAverage = complete ? round2(contribution / 100) : null;
  const finalGrade = complete ? roundFinal(contribution / 100) : null;

  let status: GradeStatus;
  if (!configComplete) status = 'incomplete-config';
  else if (!allGraded) status = failedMinimums > 0 ? 'failed' : 'in-progress';
  else status = finalGrade! >= passingGrade && failedMinimums === 0 ? 'approved' : 'failed';

  return { weightSum: total, gradedWeight, currentAverage, finalAverage, finalGrade, status, failedMinimums };
}

/**
 * Nota uniforme necessária em todas as avaliações pendentes para obter a nota final `target` (RN07).
 * x = ((A − 0,5)·100 − C) / P, limitada inferiormente pela maior nota mínima pendente.
 */
export function requiredScore(items: readonly GradeItem[], target: number): RequiredScore {
  if (!Number.isFinite(target) || target < 0 || target > MAX_GRADE) {
    throw new RangeError('A nota-alvo tem de estar entre 0 e 20');
  }
  if (Math.abs(weightSum(items) - 100) >= EPS) return { status: 'incomplete-config' };

  const pending = items.filter((a) => !isGraded(a));
  if (pending.length === 0) return { status: 'no-pending' };

  const graded = items.filter(isGraded);
  if (graded.some(belowMinimum)) return { status: 'impossible', reason: 'failed-minimum' };

  const contribution = graded.reduce((s, a) => s + a.score * a.weight, 0);
  const pendingWeight = pending.reduce((s, a) => s + a.weight, 0);
  const x = ((target - 0.5) * 100 - contribution) / pendingWeight;
  const maxMin = Math.max(0, ...pending.map((a) => a.minScore ?? 0));

  if (x > MAX_GRADE + EPS) return { status: 'impossible', reason: 'above-max' };
  if (x <= 0 && maxMin <= 0) return { status: 'secured' };
  return { status: 'needed', value: ceil2(Math.max(x, maxMin)) };
}

export interface DisciplineResult {
  finalGrade: number | null;
  ects: number | null;
  approved: boolean;
}

/** Média global ponderada por ECTS das disciplinas aprovadas (RN08). Sem ECTS conta com peso 1. */
export function globalAverage(rows: readonly DisciplineResult[]): {
  average: number | null;
  credits: number;
  missingEcts: boolean;
} {
  const approved = rows.filter((r) => r.approved && r.finalGrade !== null);
  const credits = approved.reduce((s, r) => s + (r.ects ?? 1), 0);
  if (credits === 0) return { average: null, credits: 0, missingEcts: false };
  const sum = approved.reduce((s, r) => s + r.finalGrade! * (r.ects ?? 1), 0);
  return {
    average: round2(sum / credits),
    credits,
    missingEcts: approved.some((r) => r.ects == null),
  };
}
