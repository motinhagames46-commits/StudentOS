import { computeGrades, requiredScore, DEFAULT_PASSING_GRADE } from '@studentos/shared';

interface DisciplineWithAssessments {
  passingGrade: number;
  assessments: { weight: number; score: number | null; minScore: number | null }[];
}

/** Resumo de notas de uma disciplina, incluído nas respostas da API. */
export function gradeSummary(discipline: DisciplineWithAssessments, target?: number) {
  const summary = computeGrades(discipline.assessments, discipline.passingGrade);
  const passTarget = discipline.passingGrade ?? DEFAULT_PASSING_GRADE;
  return {
    ...summary,
    required: {
      target: target ?? passTarget,
      result: requiredScore(discipline.assessments, target ?? passTarget),
    },
  };
}
