// Ritmo de estudo predefinido — o «valor predefinido documentado» do spec §11.2 para avaliações sem tempo de
// estudo indicado. Função pura: não inventa datas, não grava nada e diz o que falta quando não pode calcular.
//
// Até 2026-11-02 o orçamento vinha dos ECTS (25 h por ECTS, menos as aulas). O dono decidiu deixar os ECTS de
// fora (conselho de 2026-11-02): todas as disciplinas contam com o mesmo tempo de estudo autónomo.
//
//   orçamento da avaliação = STUDY_HOURS_PER_DISCIPLINE × peso da avaliação
//   ritmo diário = orçamento ÷ dias desde o início do semestre até à data da avaliação (ou ao fim do semestre)
//   quota de um período = ritmo × dias do período (a partir de agora) − o que já foi estudado nesse período
//
// O ritmo é fixo: o que ficou por estudar em semanas anteriores não se acumula em cima da semana atual. Para mais
// ou menos tempo numa avaliação, o estudante indica o «tempo de estudo» dela, que passa à frente deste valor.

/**
 * Estudo autónomo por disciplina e semestre. Valor predefinido: fica entre o de uma UC de 3 ECTS e o de uma de
 * 6 ECTS (75 h e 150 h de trabalho pelo DL 42/2005), já sem as aulas.
 */
export const STUDY_HOURS_PER_DISCIPLINE = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PaceInput {
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

export type PaceMissing = 'SEMESTER' | 'SEMESTER_OVER';

export type Pace =
  | { ok: true; budgetMinutes: number; weeklyMinutes: number; quotaMinutes: number; until: Date }
  | { ok: false; missing: PaceMissing };

export function studyPace(input: PaceInput): Pace {
  if (!input.semester) return { ok: false, missing: 'SEMESTER' };

  const semesterEnd = input.semester.end.getTime() + DAY_MS; // fim do último dia
  const until = input.assessmentDate ? input.assessmentDate.getTime() : semesterEnd;
  if (until <= input.now.getTime()) return { ok: false, missing: 'SEMESTER_OVER' };
  // Uma avaliação marcada antes do início do semestre (dado incoerente) reparte-se desde hoje até à data.
  const start = until <= input.semester.start.getTime() ? input.now.getTime() : input.semester.start.getTime();

  const budgetMinutes = Math.round((STUDY_HOURS_PER_DISCIPLINE * 60 * input.weightPercent) / 100);
  const dailyMinutes = budgetMinutes / Math.max(1, (until - start) / DAY_MS);

  const windowStart = Math.max(input.window.from.getTime(), input.now.getTime(), start);
  const windowEnd = Math.min(input.window.to.getTime(), until);
  const windowDays = Math.max(0, (windowEnd - windowStart) / DAY_MS);
  const due = Math.ceil(dailyMinutes * windowDays - 1e-9) - input.doneInWindowMinutes;
  const quotaMinutes = Math.max(0, Math.min(budgetMinutes - input.doneTotalMinutes, due));

  return { ok: true, budgetMinutes, weeklyMinutes: Math.round(dailyMinutes * 7), quotaMinutes, until: new Date(until) };
}

/** «36 h», «1 h 40», «45 min». */
export function formatStudyMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

/** Explicação da conta, só com números do sistema, por exemplo «40 % de 60 h → 24 h até 31/01 ≈ 1 h 06/semana». */
export function paceNote(weightPercent: number, pace: Extract<Pace, { ok: true }>, timeZone: string): string {
  const until = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', timeZone }).format(
    new Date(pace.until.getTime() - 1),
  );
  return (
    `${weightPercent} % de ${STUDY_HOURS_PER_DISCIPLINE} h → ${formatStudyMinutes(pace.budgetMinutes)} até ${until} ` +
    `≈ ${formatStudyMinutes(pace.weeklyMinutes)}/semana`
  );
}
