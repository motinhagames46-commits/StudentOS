// Pedidos à API com cache (TanStack Query). As mutações invalidam as vistas que dependem dos dados.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssessmentCreateInput,
  AssistantAnswer,
  AssistantAskInput,
  AssessmentUpdateInput,
  DisciplineCreateInput,
  DocumentConfirmItem,
  DocumentCreateInput,
  FinanceInsightView,
  FinanceSummary,
  FinanceTransactionView,
  GoalCreateInput,
  SavingsGoalView,
  TransactionCreateInput,
  QuizAnswerInput,
  QuizCreateInput,
  QuizSummary,
  QuizView,
  ReviewQueue,
  DisciplineUpdateInput,
  ScheduleBlockCreateInput,
  ScheduleBlockUpdateInput,
  StudyPreferencesInput,
  SemesterCreateInput,
  SemesterUpdateInput,
  StudySessionQuery,
  StudySessionStartInput,
  StudyDocumentSummary,
  StudyDocumentView,
  TaskCreateInput,
  TaskQuery,
  TaskUpdateInput,
} from '@studentos/shared';
import { useToast } from '../components/Toast';
import { ApiError, api, errorMessage } from '../lib/api';
import { dashboardWithoutPendingTasks, withoutPendingTasks } from '../lib/pendingTaskDeletes';
import type {
  AiStatusView,
  Alerts,
  Assessment,
  CalendarData,
  Dashboard,
  Discipline,
  PlannerSessionsResponse,
  PlanView,
  Semester,
  Stats,
  StudyPreferencesView,
  StudySession,
  Suggestion,
  Task,
} from '../lib/types';

function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string | number] => e[1] !== undefined && e[1] !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}

const dataKeys = [
  'dashboard',
  'tasks',
  'disciplines',
  'discipline',
  'study-sessions',
  'stats',
  'calendar',
  'alerts',
  'planner',
  'suggestion',
];

export function useInvalidateAll(extraKeys: string[] = []) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([...dataKeys, ...extraKeys].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

/** O semestre ativo aparece no /me (barra lateral) e filtra o painel e as disciplinas. */
const useInvalidateSemesters = () => useInvalidateAll(['me', 'semesters']);

export const useDashboard = () =>
  useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/dashboard'),
    select: dashboardWithoutPendingTasks,
  });

export const useTasks = (filters: TaskQuery = {}) =>
  useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => api<Task[]>(`/tasks${toQueryString(filters)}`),
    select: withoutPendingTasks,
  });

export const useDisciplines = (semesterId?: number, archived = false) =>
  useQuery({
    queryKey: ['disciplines', semesterId, archived],
    queryFn: () =>
      api<Discipline[]>(`/disciplines${toQueryString({ semesterId, archived: archived ? 'true' : undefined })}`),
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
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAll();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, ...input }: TaskUpdateInput & { id: number }) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: input }),
    // Marcar como feita (ou reabrir) aparece logo; se o servidor falhar, volta atrás e diz porquê.
    // Edições de formulário (sem `status`) continuam à espera da resposta, com os erros no formulário.
    onMutate: async ({ id, status }) => {
      if (!status) return undefined;
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      await queryClient.cancelQueries({ queryKey: ['dashboard'] });
      const snapshot = [
        ...queryClient.getQueriesData({ queryKey: ['tasks'] }),
        ...queryClient.getQueriesData({ queryKey: ['dashboard'] }),
      ];
      const mark = <T extends { id: number }>(t: T) => (t.id === id ? { ...t, status } : t);
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (list) => list?.map(mark));
      queryClient.setQueryData<Dashboard>(
        ['dashboard'],
        (d) => d && { ...d, upcomingTasks: d.upcomingTasks.map(mark), overdueTasks: d.overdueTasks.map(mark) },
      );
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (!context) return;
      for (const [key, data] of context.snapshot) queryClient.setQueryData(key, data);
      toast({ message: `Não foi possível guardar a tarefa: ${errorMessage(error)}`, tone: 'error' });
    },
    onSettled: invalidate,
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

// Modo foco: pausar/retomar a sessão em curso (o estado fica no servidor)
export function usePauseStudySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'pause' | 'resume' }) =>
      api<StudySession>(`/study-sessions/${id}/${action}`, { method: 'POST', body: {} }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['study-sessions'] }),
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

// Planeador (spec §11)
const plannerKeys = ['planner', 'calendar', 'dashboard', 'stats', 'suggestion'];
function useInvalidatePlanner() {
  const queryClient = useQueryClient();
  return () => Promise.all(plannerKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

export const useStudyPreferences = () =>
  useQuery({ queryKey: ['preferences'], queryFn: () => api<StudyPreferencesView>('/preferences/study') });

export function useSaveStudyPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudyPreferencesInput) =>
      api<StudyPreferencesView>('/preferences/study', { method: 'PUT', body: input }),
    onSuccess: (data) => {
      queryClient.setQueryData(['preferences'], data);
      void queryClient.invalidateQueries({ queryKey: ['planner'] });
    },
  });
}

export const usePlannerSessions = (from: string, to: string) =>
  useQuery({
    queryKey: ['planner', 'sessions', from, to],
    queryFn: () => api<PlannerSessionsResponse>(`/planner/sessions${toQueryString({ from, to })}`),
    placeholderData: (previous) => previous,
  });

export const useSuggestion = () =>
  useQuery({ queryKey: ['suggestion'], queryFn: () => api<Suggestion>('/planner/suggestion') });

export function usePlanPreview() {
  const invalidate = useInvalidatePlanner();
  return useMutation({
    mutationFn: ({ replan, ...body }: { replan?: boolean; from?: string; days?: number }) =>
      api<PlanView>(replan ? '/planner/replan' : '/planner/preview', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useConfirmPlan() {
  const invalidate = useInvalidatePlanner();
  return useMutation({
    mutationFn: (id: string) => api<{ created: number; removed: number }>(`/planner/${id}/confirm`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useDiscardPlan() {
  const invalidate = useInvalidatePlanner();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/planner/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function usePlannedSessionAction() {
  const invalidate = useInvalidatePlanner();
  return useMutation({
    mutationFn: async (
      action:
        | { kind: 'complete'; id: number; actualMinutes?: number }
        | { kind: 'miss'; id: number }
        | { kind: 'pin'; id: number; pinned: boolean }
        | { kind: 'move'; id: number; startAt: string; endAt: string }
        | { kind: 'remove'; id: number },
    ) => {
      switch (action.kind) {
        case 'complete':
          return api<unknown>(`/planned-sessions/${action.id}/complete`, {
            method: 'POST',
            body: action.actualMinutes ? { actualMinutes: action.actualMinutes } : {},
          });
        case 'miss':
          return api<unknown>(`/planned-sessions/${action.id}/miss`, { method: 'POST', body: {} });
        case 'pin':
          return api<unknown>(`/planned-sessions/${action.id}`, { method: 'PATCH', body: { pinned: action.pinned } });
        case 'move':
          return api<unknown>(`/planned-sessions/${action.id}`, {
            method: 'PATCH',
            body: { startAt: action.startAt, endAt: action.endAt },
          });
        case 'remove':
          return api<void>(`/planned-sessions/${action.id}`, { method: 'DELETE' });
      }
    },
    onSuccess: invalidate,
  });
}

/** Estado da IA nesta conta (a navegação esconde os Documentos a quem não a pode usar). */
export const useAiStatus = () => useQuery({ queryKey: ['ai-status'], queryFn: () => api<AiStatusView>('/ai/status') });

export const useDocuments = () =>
  useQuery({ queryKey: ['documents'], queryFn: () => api<StudyDocumentSummary[]>('/documents') });

export const useDocument = (id: number) =>
  useQuery({
    queryKey: ['document', id],
    queryFn: () => api<StudyDocumentView>(`/documents/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentCreateInput) =>
      api<StudyDocumentView>('/documents', { method: 'POST', body: input, expectSlow: true }),
    onSuccess: (doc) => {
      queryClient.setQueryData(['document', doc.id], doc);
      return queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useConfirmDocument(id: number) {
  const invalidateAll = useInvalidateAll(['documents', 'document']);
  return useMutation({
    mutationFn: (items: DocumentConfirmItem[]) =>
      api<{ created: number; updated: number }>(`/documents/${id}/confirm`, { method: 'POST', body: { items } }),
    onSuccess: invalidateAll,
    // Já revisto noutro separador: recarregar fecha a revisão em vez de repetir o 409.
    onError: (err) => (err instanceof ApiError && err.status === 409 ? invalidateAll() : undefined),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

/** Pergunta ao assistente: a conversa fica só no estado da página. */
export const useAskAssistant = () =>
  useMutation({
    mutationFn: (input: AssistantAskInput) =>
      api<AssistantAnswer>('/assistant/ask', { method: 'POST', body: input, expectSlow: true }),
  });

export const useReviewQueue = () => useQuery({ queryKey: ['reviews'], queryFn: () => api<ReviewQueue>('/reviews') });

/** Durante uma revisão a lista não é recarregada (não mexe nas perguntas a meio); só no fim. */
export const useReviewCard = () =>
  useMutation({
    mutationFn: ({ id, rating }: { id: number; rating: number }) =>
      api<{ due: string; retention: number }>(`/reviews/${id}`, { method: 'POST', body: { rating } }),
  });

export const useDeleteCard = () =>
  useMutation({ mutationFn: (id: number) => api(`/reviews/${id}`, { method: 'DELETE' }) });

export const useQuizzes = () => useQuery({ queryKey: ['quizzes'], queryFn: () => api<QuizSummary[]>('/quizzes') });

export const useQuiz = (id: number) =>
  useQuery({
    queryKey: ['quiz', id],
    queryFn: () => api<QuizView>(`/quizzes/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });

export function useCreateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuizCreateInput) =>
      api<QuizView>('/quizzes', { method: 'POST', body: input, expectSlow: true }),
    onSuccess: (quiz) => {
      queryClient.setQueryData(['quiz', quiz.id], quiz);
      return queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
  });
}

export function useAnswerQuiz(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuizAnswerInput) =>
      api<QuizView>(`/quizzes/${id}/answer`, { method: 'POST', body: input, expectSlow: true }),
    onSuccess: (quiz) => {
      queryClient.setQueryData(['quiz', id], quiz);
      return Promise.all(['quizzes', 'reviews'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
}

/** Tudo o que é das finanças fica sob ['finances', …]: uma mudança invalida o conjunto. */
function useInvalidateFinances() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['finances'] });
}

export const useFinanceSummary = (month: string) =>
  useQuery({
    queryKey: ['finances', 'summary', month],
    queryFn: () => api<FinanceSummary>(`/finances/summary?month=${month}`),
  });

export const useTransactions = (month: string) =>
  useQuery({
    queryKey: ['finances', 'transactions', month],
    queryFn: () => api<FinanceTransactionView[]>(`/finances/transactions?month=${month}`),
  });

export const useFinanceCategories = () =>
  useQuery({
    queryKey: ['finances', 'categories'],
    queryFn: () => api<{ id: number; kind: 'EXPENSE' | 'INCOME'; name: string }[]>('/finances/categories'),
  });

export function useAddTransaction() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: (input: TransactionCreateInput) =>
      api<FinanceTransactionView>('/finances/transactions', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: (id: number) => api(`/finances/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export const useGoals = () =>
  useQuery({ queryKey: ['finances', 'goals'], queryFn: () => api<SavingsGoalView[]>('/finances/goals') });

export function useCreateGoal() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: (input: GoalCreateInput) => api<SavingsGoalView>('/finances/goals', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useAddToGoal() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: ({ id, amountCents }: { id: number; amountCents: number }) =>
      api<SavingsGoalView>(`/finances/goals/${id}/add`, { method: 'POST', body: { amountCents } }),
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateFinances();
  return useMutation({
    mutationFn: (id: number) => api(`/finances/goals/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export const useLatestInsight = () =>
  useQuery({
    queryKey: ['finances', 'insight'],
    queryFn: () => api<FinanceInsightView | null>('/finances/insights/latest'),
  });

export function useCreateInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<FinanceInsightView>('/finances/insights', { method: 'POST', expectSlow: true }),
    onSuccess: (insight) => queryClient.setQueryData(['finances', 'insight'], insight),
  });
}
