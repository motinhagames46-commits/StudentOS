// Regras puras do questionário de boas-vindas: modelos de avaliação, disponibilidade a partir de
// períodos e resumo do plano proposto. Cada resposta alimenta um modelo real (disciplinas, avaliações,
// preferências), por isso nada aqui é decorativo.
import type { AvailabilityWindowInput, ProposedSession } from '@studentos/shared';

export type AssessmentTypeCode = 'TEST' | 'EXAM' | 'PROJECT' | 'ASSIGNMENT' | 'PRESENTATION' | 'OTHER';

export interface AssessmentTemplate {
  id: string;
  label: string;
  items: { name: string; type: AssessmentTypeCode; weight: number }[];
}

/** Modelos comuns no ensino superior português; os pesos de cada modelo somam 100 %. */
export const ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  { id: 'exame', label: 'Só exame final (100 %)', items: [{ name: 'Exame', type: 'EXAM', weight: 100 }] },
  {
    id: 'teste-exame',
    label: 'Teste + exame (40 % + 60 %)',
    items: [
      { name: 'Teste', type: 'TEST', weight: 40 },
      { name: 'Exame', type: 'EXAM', weight: 60 },
    ],
  },
  {
    id: 'dois-testes',
    label: 'Dois testes (50 % + 50 %)',
    items: [
      { name: 'Teste 1', type: 'TEST', weight: 50 },
      { name: 'Teste 2', type: 'TEST', weight: 50 },
    ],
  },
  {
    id: 'trabalho-exame',
    label: 'Trabalho + exame (40 % + 60 %)',
    items: [
      { name: 'Trabalho prático', type: 'PROJECT', weight: 40 },
      { name: 'Exame', type: 'EXAM', weight: 60 },
    ],
  },
  {
    id: 'trabalho-teste',
    label: 'Trabalho + teste (50 % + 50 %)',
    items: [
      { name: 'Trabalho prático', type: 'PROJECT', weight: 50 },
      { name: 'Teste', type: 'TEST', weight: 50 },
    ],
  },
];

export interface StudyPeriod {
  id: string;
  label: string;
  startMinute: number;
  endMinute: number;
}

/** Períodos que não se sobrepõem, para gerar disponibilidade válida sem edição manual. */
export const STUDY_PERIODS: StudyPeriod[] = [
  { id: 'manha', label: 'Manhã (9:00–12:00)', startMinute: 9 * 60, endMinute: 12 * 60 },
  { id: 'tarde', label: 'Tarde (14:00–17:00)', startMinute: 14 * 60, endMinute: 17 * 60 },
  { id: 'fim-tarde', label: 'Fim de tarde (18:00–20:00)', startMinute: 18 * 60, endMinute: 20 * 60 },
  { id: 'noite', label: 'Noite (21:00–23:00)', startMinute: 21 * 60, endMinute: 23 * 60 },
];

export const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Uma janela por dia × período escolhido (dias 1 = segunda … 7 = domingo), por ordem. */
export function availabilityFromChoices(weekdays: number[], periodIds: string[]): AvailabilityWindowInput[] {
  const periods = STUDY_PERIODS.filter((p) => periodIds.includes(p.id));
  return [...new Set(weekdays)]
    .sort((a, b) => a - b)
    .flatMap((weekday) => periods.map((p) => ({ weekday, startMinute: p.startMinute, endMinute: p.endMinute })));
}

/** Horas de estudo possíveis por semana com estas escolhas (antes de descontar aulas). */
export function weeklyAvailableMinutes(weekdays: number[], periodIds: string[]): number {
  return availabilityFromChoices(weekdays, periodIds).reduce((s, w) => s + (w.endMinute - w.startMinute), 0);
}

export interface SessionPreset {
  id: string;
  label: string;
  sessionMinutes: number;
  breakMinutes: number;
}

export const SESSION_PRESETS: SessionPreset[] = [
  { id: '25-5', label: '25 min + 5 de pausa', sessionMinutes: 25, breakMinutes: 5 },
  { id: '50-10', label: '50 min + 10 de pausa', sessionMinutes: 50, breakMinutes: 10 },
  { id: '90-15', label: '90 min + 15 de pausa', sessionMinutes: 90, breakMinutes: 15 },
];

/** Resumo do plano: minutos e sessões por disciplina (ordem decrescente de minutos). */
export function summarizeByDiscipline(
  sessions: Pick<ProposedSession, 'disciplineCode' | 'minutes'>[],
): { code: string; minutes: number; sessions: number }[] {
  const byCode = new Map<string, { minutes: number; sessions: number }>();
  for (const s of sessions) {
    const code = s.disciplineCode ?? 'Sem disciplina';
    const row = byCode.get(code) ?? { minutes: 0, sessions: 0 };
    row.minutes += s.minutes;
    row.sessions += 1;
    byCode.set(code, row);
  }
  return [...byCode.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.minutes - a.minutes || a.code.localeCompare(b.code));
}
