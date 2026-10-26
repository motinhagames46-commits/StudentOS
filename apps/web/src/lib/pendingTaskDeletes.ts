import type { Dashboard, Task } from './types';

/** Tarefas eliminadas com «Desfazer» ainda disponível: ainda existem no servidor, mas não se mostram. */
export const pendingTaskDeletes = new Set<number>();

/** `select` das listas: um refetch durante os 10 s do «Desfazer» não traz a tarefa de volta. */
export const withoutPendingTasks = (tasks: Task[]): Task[] =>
  pendingTaskDeletes.size ? tasks.filter((t) => !pendingTaskDeletes.has(t.id)) : tasks;

export const dashboardWithoutPendingTasks = (d: Dashboard): Dashboard =>
  pendingTaskDeletes.size
    ? { ...d, upcomingTasks: withoutPendingTasks(d.upcomingTasks), overdueTasks: withoutPendingTasks(d.overdueTasks) }
    : d;
