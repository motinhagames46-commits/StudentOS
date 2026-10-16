// Pedidos à API com cache (TanStack Query). As mutações invalidam as vistas que dependem dos dados.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssessmentCreateInput,
  AssessmentUpdateInput,
  DisciplineCreateInput,
  DisciplineUpdateInput,
  TaskCreateInput,
  TaskQuery,
  TaskUpdateInput,
} from '@studentos/shared';
import { api } from '../lib/api';
import type { Assessment, Dashboard, Discipline, Task } from '../lib/types';

function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['dashboard', 'tasks', 'disciplines', 'discipline'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });

export const useTasks = (filters: TaskQuery = {}) =>
  useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => api<Task[]>(`/tasks${toQueryString(filters)}`),
  });

export const useDisciplines = () =>
  useQuery({ queryKey: ['disciplines'], queryFn: () => api<Discipline[]>('/disciplines') });

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
