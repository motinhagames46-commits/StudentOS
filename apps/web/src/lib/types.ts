import type {
  AssessmentType,
  GradeSummary,
  PlanResult,
  RequiredScore,
  TaskPriority,
  TaskStatus,
} from '@studentos/shared';

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface Semester {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface MeResponse {
  user: User;
  activeSemester: Semester | null;
}

export interface GradeSummaryDto extends GradeSummary {
  required: { target: number; result: RequiredScore };
}

export interface Assessment {
  id: number;
  name: string;
  type: AssessmentType;
  weight: number;
  date: string | null;
  score: number | null;
  minScore: number | null;
  prepMinutes: number | null;
  disciplineId: number;
}

export interface DisciplineRef {
  id: number;
  name: string;
  code: string;
  color: string | null;
}

export interface Discipline extends DisciplineRef {
  ects: number | null;
  archivedAt: string | null;
  passingGrade: number;
  semesterId: number | null;
  semester?: Semester | null;
  assessments: Assessment[];
  pendingTasks: number;
  grades: GradeSummaryDto;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
  disciplineId: number | null;
  discipline: DisciplineRef | null;
  estimatedMinutes: number | null;
  origin?: 'MANUAL' | 'IMPORT_ICS' | 'IMPORT_CSV';
}

export interface Dashboard {
  activeSemester: Semester | null;
  upcomingTasks: Task[];
  overdueTasks: Task[];
  upcomingAssessments: (Assessment & { discipline: DisciplineRef })[];
  disciplines: (DisciplineRef & { ects: number | null; passingGrade: number; grades: GradeSummaryDto })[];
  globalAverage: { average: number | null; credits: number; missingEcts: boolean };
}

export interface StudySession {
  id: number;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  disciplineId: number | null;
  discipline: DisciplineRef | null;
  /** Modo foco (spec §7.6): objetivo e pausa sugerida, em minutos. */
  targetMinutes: number | null;
  breakMinutes: number | null;
  /** Início da pausa em curso; o tempo de pausas já terminadas está em pausedSeconds. */
  pausedAt: string | null;
  pausedSeconds: number;
}

export interface Stats {
  range: { from: string; to: string; days: number };
  studyByDiscipline: { discipline: DisciplineRef | null; minutes: number }[];
  studyByDay: { date: string; minutes: number }[];
  totalMinutes: number;
  tasks: { todo: number; done: number; overdue: number; completedInRange: number };
}

export interface CalendarData {
  tasks: Task[];
  assessments: (Assessment & { discipline: DisciplineRef })[];
  blocks: BlockOccurrence[];
}

export interface Alerts {
  tasks: Task[];
  assessments: (Assessment & { discipline: DisciplineRef })[];
  overdue: number;
  count: number;
}

export interface BlockOccurrence {
  id: string;
  blockId: number;
  title: string;
  kind: 'CLASS' | 'EVENT' | 'OTHER';
  start: string;
  end: string;
  allDay: boolean;
  isBusy: boolean;
  location: string | null;
  origin: 'MANUAL' | 'IMPORT_ICS' | 'IMPORT_CSV';
  sourceLabel: string | null;
  recurring: boolean;
  discipline: DisciplineRef | null;
  conflict: boolean;
}

export type PlannedSessionStatus = 'PLANNED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';

export interface PlannedSession {
  id: number;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: PlannedSessionStatus;
  pinned: boolean;
  reason: string;
  protected?: boolean;
  task: { id: number; title: string; status: string } | null;
  assessment: { id: number; name: string; date: string | null } | null;
  discipline: DisciplineRef | null;
}

export interface PlanView {
  id: string;
  version: number;
  status: string;
  fromDate: string;
  toDate: string;
  createdAt: string;
  expiresAt: string;
  proposal: PlanResult & {
    kind: 'plan' | 'replan';
    removals: { id: number; startAt: string; endAt: string; reason: string }[];
  };
}

export interface PlannerSessionsResponse {
  sessions: PlannedSession[];
  draft: PlanView | null;
  hasAvailability: boolean;
}

export interface StudyPreferencesView {
  sessionMinutes: number;
  minSessionMinutes: number;
  breakMinutes: number;
  maxDailyMinutes: number;
  availability: { weekday: number; startMinute: number; endMinute: number }[];
}

export type Suggestion =
  | { kind: 'session'; session: PlannedSession; message: string }
  | {
      kind: 'item';
      item: { type: 'task' | 'assessment'; id: number; title: string; disciplineId: number | null };
      /** O item mais urgente ainda não tem duração estimada: o planeador não lhe consegue reservar tempo. */
      needsEstimate?: boolean;
      message: string;
    }
  | { kind: 'missing'; message: string };
