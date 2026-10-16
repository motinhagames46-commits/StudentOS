import type { AssessmentType, GradeStatus, TaskPriority } from '@studentos/shared';

const TZ = 'Europe/Lisbon';
const DAY = 24 * 60 * 60 * 1000;

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso));
}

/** Nota em formato português: 13,5 · 8,0 · 9,25 · "—" quando não há valor. */
export function formatGrade(value: number | null | undefined, minDigits = 0): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-PT', { minimumFractionDigits: minDigits, maximumFractionDigits: 2 });
}

function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** "Hoje", "Amanhã", "Daqui a 3 dias", "Ontem", "Há 2 dias". */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / DAY);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days === -1) return 'Ontem';
  return days > 0 ? `Daqui a ${days} dias` : `Há ${-days} dias`;
}

/** Converte o valor de um <input type="date"> (aaaa-mm-dd, hora local) para ISO 8601 UTC. */
export function dateInputToIso(value: string, time = '23:59'): string {
  return new Date(`${value}T${time}:00`).toISOString();
}

export function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const priorityLabels: Record<TaskPriority, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };

export const assessmentTypeLabels: Record<AssessmentType, string> = {
  TEST: 'Teste',
  EXAM: 'Exame',
  PROJECT: 'Projeto',
  ASSIGNMENT: 'Trabalho',
  PRESENTATION: 'Apresentação',
  OTHER: 'Outro',
};

export const gradeStatusLabels: Record<GradeStatus, string> = {
  'no-assessments': 'Sem avaliações',
  'incomplete-config': 'Pesos incompletos',
  'in-progress': 'Em curso',
  approved: 'Aprovado',
  failed: 'Reprovado',
};

export const disciplineColors = [
  '#2563EB',
  '#16A34A',
  '#9333EA',
  '#EA580C',
  '#0891B2',
  '#DB2777',
  '#A16207',
  '#4F46E5',
];

/** Duração legível: "0 min", "45 s", "12 min", "1 h 05 min". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return '0 min';
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return `${Math.floor(ms / 1000)} s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`;
}

/** Cronómetro: "05:09" ou "1:05:09". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Datas de semestre (sem hora): o valor do <input type="date"> vai como meia-noite UTC. */
export const dateOnlyToIso = (value: string) => `${value}T00:00:00.000Z`;
export const isoToDateOnly = (iso: string) => iso.slice(0, 10);
