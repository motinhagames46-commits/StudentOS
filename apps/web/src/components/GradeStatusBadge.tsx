import { DEFAULT_PASSING_GRADE, isAtRisk } from '@studentos/shared';
import { gradeStatusLabels } from '../lib/format';
import type { GradeSummaryDto } from '../lib/types';
import { Badge } from './ui';

export function gradeTone(status: GradeSummaryDto['status']) {
  return status === 'approved'
    ? 'green'
    : status === 'failed'
      ? 'red'
      : status === 'incomplete-config'
        ? 'amber'
        : 'neutral';
}

/** Estado da disciplina; "Em risco" quando ainda está em curso mas a média atual não chega para passar. */
export function GradeStatusBadge({
  grades,
  passingGrade = DEFAULT_PASSING_GRADE,
}: {
  grades: GradeSummaryDto;
  passingGrade?: number;
}) {
  if (isAtRisk(grades, passingGrade)) return <Badge tone="red">Em risco</Badge>;
  return <Badge tone={gradeTone(grades.status)}>{gradeStatusLabels[grades.status]}</Badge>;
}
