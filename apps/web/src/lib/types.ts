import type { AssessmentType, GradeSummary, RequiredScore, TaskPriority, TaskStatus } from '@studentos/shared';

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
}
