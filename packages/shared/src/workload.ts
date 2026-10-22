// Ritmo de estudo pelos ECTS — o «valor predefinido documentado» do spec §11.2 para avaliações sem tempo de
// estudo indicado. Função pura: não inventa datas, não grava nada e diz o que falta quando não pode calcular.
//
// Base legal: DL 42/2005, art. 5.º — 1 ECTS corresponde a 25 a 28 horas de trabalho do estudante, aulas
// incluídas. Usa-se o limite inferior, para o plano nunca pedir mais do que a lei prevê.
//
//   horas autónomas da UC = ECTS × 25 h − horas de aula da UC no semestre
//   orçamento da avaliação = horas autónomas × peso da avaliação
//   ritmo diário = orçamento ÷ dias desde o início do semestre até à data da avaliação (ou ao fim do semestre)
//   quota de um período = ritmo × dias do período (a partir de agora) − o que já foi estudado nesse período
//
// O ritmo é fixo: o que ficou por estudar em semanas anteriores não se acumula em cima da semana atual.

export const HOURS_PER_ECTS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface EctsPaceInput {
  ects: number | null;
  /** Minutos de aula da UC no semestre. */
  contactMinutes: number;
  weightPercent: number;
  /** Datas do semestre (dias civis; `end` inclusive). */
  semester: { start: Date; end: Date } | null;
  /** Data marcada da avaliação; sem data, o ritmo vai até ao fim do semestre. */
  assessmentDate: Date | null;
  window: { from: Date; to: Date };
  now: Date;
  /** Minutos já estudados ou reservados (sessões concluídas e protegidas) para esta avaliação. */
  doneTotalMinutes: number;
  /** Os mesmos minutos, só os que caem dentro do período. */
  doneInWindowMinutes: number;
}

export type EctsPaceMissing = 'ECTS' | 'SEMESTER' | 'SEMESTER_OVER';

export type EctsPace =
  | {
      ok: true;
      autonomousMinutes: number;
      budgetMinutes: number;
      weeklyMinutes: number;
      quotaMinutes: number;
      until: Date;
    }
  | { ok: false; missing: EctsPaceMissing };

export function ectsPace(input: EctsPaceInput): EctsPace {
  if (!input.ects || input.ects <= 0) return { ok: false, missing: 'ECTS' };
  if (!input.semester) return { ok: false, missing: 'SEMESTER' };

  const start = input.semester.start.getTime();
  const semesterEnd = input.semester.end.getTime() + DAY_MS; // fim do último dia
  const until = input.assessmentDate ? input.assessmentDate.getTime() : semesterEnd;
  if (until <= input.now.getTime()) return { ok: false, missing: 'SEMESTER_OVER' };

  const autonomousMinutes = Math.max(0, Math.round(input.ects * HOURS_PER_ECTS * 60 - input.contactMinutes));
  const budgetMinutes = Math.round((autonomousMinutes * input.weightPercent) / 100);
  const dailyMinutes = budgetMinutes / Math.max(1, (until - start) / DAY_MS);

  const windowStart = Math.max(input.window.from.getTime(), input.now.getTime(), start);
  const windowEnd = Math.min(input.window.to.getTime(), until);
  const windowDays = Math.max(0, (windowEnd - windowStart) / DAY_MS);
  const due = Math.ceil(dailyMinutes * windowDays - 1e-9) - input.doneInWindowMinutes;
  const quotaMinutes = Math.max(0, Math.min(budgetMinutes - input.doneTotalMinutes, due));

  return {
    ok: true,
    autonomousMinutes,
    budgetMinutes,
    weeklyMinutes: Math.round(dailyMinutes * 7),
    quotaMinutes,
    until: new Date(until),
  };
}

/** «36 h», «1 h 40», «45 min». */
export function formatStudyMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

/**
 * Explicação da conta, só com números do sistema, por exemplo
 * «6 ECTS × 25 h − 60 h de aulas = 90 h; 40 % → 36 h até 31/01 ≈ 1 h 40/semana».
 */
export function ectsPaceNote(
  input: Pick<EctsPaceInput, 'ects' | 'contactMinutes' | 'weightPercent'> & { contactEstimated: boolean },
  pace: Extract<EctsPace, { ok: true }>,
  timeZone: string,
): string {
  const until = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', timeZone }).format(
    new Date(pace.until.getTime() - 1),
  );
  const classes =
    input.contactMinutes > 0
      ? ` − ${input.contactEstimated ? '~' : ''}${formatStudyMinutes(input.contactMinutes)} de aulas`
      : '';
  return (
    `${input.ects} ECTS × ${HOURS_PER_ECTS} h${classes} = ${formatStudyMinutes(pace.autonomousMinutes)}; ` +
    `${input.weightPercent} % → ${formatStudyMinutes(pace.budgetMinutes)} até ${until} ` +
    `≈ ${formatStudyMinutes(pace.weeklyMinutes)}/semana`
  );
}
