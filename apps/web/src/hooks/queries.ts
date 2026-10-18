// Pedidos à API com cache (TanStack Query). As mutações invalidam as vistas que dependem dos dados.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssessmentCreateInput,
  AssessmentUpdateInput,
  DisciplineCreateInput,
  DisciplineUpdateInput,
  ScheduleBlockCreateInput,
  ScheduleBlockUpdateInput,
  SemesterCreateInput,
  SemesterUpdateInput,
  StudySessionQuery,
  StudySessionStartInput,
  TaskCreateInput,
  TaskQuery,
  TaskUpdateInput,
} from '@studentos/shared';
import { api } from '../lib/api';
import type {
  Alerts,
  Assessment,
  CalendarData,
  Dashboard,
  Discipline,
  Semester,
  Stats,
  StudySession,
  Task,
} from '../lib/types';

function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string | number] => e[1] !== undefined && e[1] !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}

const dataKeys = ['dashboard', 'tasks', 'disciplines', 'discipline', 'study-sessions', 'stats', 'calendar', 'alerts'];

function useInvalidateAll(extraKeys: string[] = []) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([...dataKeys, ...extraKeys].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

/** O semestre ativo aparece no /me (barra lateral) e filtra o painel e as disciplinas. */
const useInvalidateSemesters = () => useInvalidateAll(['me', 'semesters']);

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });

export const useTasks = (filters: TaskQuery = {}) =>
  useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => api<Task[]>(`/tasks${toQueryString(filters)}`),
  });

export const useDisciplines = (semesterId?: number) =>
  useQuery({
    queryKey: ['disciplines', semesterId],
    queryFn: () => api<Discipline[]>(`/disciplines${toQueryString({ semesterId })}`),
  });

export const useDiscipline = (id: number) =>
  useQuery({
    queryKey: ['discipline', id],
    queryFn: () => api<Discipline>(`/disciplines/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });

export function useCreateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: TaskCreateInput) => api<Task>('/tasks', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: TaskUpdateInput & { id: number }) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCreateDiscipline() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: DisciplineCreateInput) => api<Discipline>('/disciplines', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateDiscipline() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: DisciplineUpdateInput & { id: number }) =>
      api<Discipline>(`/disciplines/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteDiscipline() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/disciplines/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCreateAssessment(disciplineId: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: AssessmentCreateInput) =>
      api<Assessment>(`/disciplines/${disciplineId}/assessments`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateAssessment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: AssessmentUpdateInput & { id: number }) =>
      api<Assessment>(`/assessments/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteAssessment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/assessments/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// RF03 — semestres. Mudar o semestre ativo altera o painel, as disciplinas e o /me.
export const useSemesters = () => useQuery({ queryKey: ['semesters'], queryFn: () => api<Semester[]>('/semesters') });

export function useCreateSemester() {
  const invalidate = useInvalidateSemesters();
  return useMutation({
    mutationFn: (input: SemesterCreateInput) => api<Semester>('/semesters', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateSemester() {
  const invalidate = useInvalidateSemesters();
  return useMutation({
    mutationFn: ({ id, ...input }: SemesterUpdateInput & { id: number }) =>
      api<Semester>(`/semesters/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteSemester() {
  const invalidate = useInvalidateSemesters();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/semesters/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// RF13 — sessões de estudo
export const useStudySessions = (range: StudySessionQuery = {}) =>
  useQuery({
    queryKey: ['study-sessions', range],
    queryFn: () => api<StudySession[]>(`/study-sessions${toQueryString(range)}`),
  });

export function useStartStudySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudySessionStartInput) =>
      api<StudySession>('/study-sessions/start', { method: 'POST', body: input }),
    onSettled: () =>
      Promise.all(['study-sessions', 'stats'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}

export function useStopStudySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<StudySession>(`/study-sessions/${id}/stop`, { method: 'POST', body: {} }),
    onSettled: () =>
      Promise.all(['study-sessions', 'stats'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}

// RF14 — estatísticas dos últimos `days` dias
export const useStats = (days = 7) =>
  useQuery({ queryKey: ['stats', days], queryFn: () => api<Stats>(`/stats?days=${days}`) });

// RF15 — calendário
export const useCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api<CalendarData>(`/calendar${toQueryString({ from, to })}`),
    placeholderData: (previous) => previous,
  });

// RF17 — alertas das próximas 48 h (atualiza a cada 5 minutos)
export const useAlerts = () =>
  useQuery({ queryKey: ['alerts'], queryFn: () => api<Alerts>('/alerts'), refetchInterval: 5 * 60 * 1000 });

// Aulas e eventos (ScheduleBlock)
function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(['calendar', 'dashboard', 'planner'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

export function useCreateBlock() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (input: ScheduleBlockCreateInput) => api<unknown>('/schedule-blocks', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateBlock() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: ({ id, ...input }: ScheduleBlockUpdateInput & { id: number }) =>
      api<unknown>(`/schedule-blocks/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteBlock() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/schedule-blocks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useSkipOccurrence() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: ({ id, occurrenceStart }: { id: number; occurrenceStart: string }) =>
      api<unknown>(`/schedule-blocks/${id}/skip`, { method: 'POST', body: { occurrenceStart } }),
    onSuccess: invalidate,
  });
}
