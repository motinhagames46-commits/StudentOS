import type { TaskQuery, TaskStatus } from '@studentos/shared';
import { useState } from 'react';
import { TaskForm } from '../components/TaskForm';
import { TaskList } from '../components/TaskList';
import { Card, ErrorState, LoadingList, PageHeader, SelectField } from '../components/ui';
import { useCreateTask, useDeleteTask, useDisciplines, useTasks, useUpdateTask } from '../hooks/queries';
import { errorMessage } from '../lib/api';

type StatusFilter = TaskStatus | 'ALL';

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'TODO', label: 'Por fazer' },
  { value: 'DONE', label: 'Concluídas' },
  { value: 'ALL', label: 'Todas' },
];

/** Lista de tarefas com criação rápida, filtros e ordenação (RF05 / RF06). */
export function TasksPage() {
  const [status, setStatus] = useState<StatusFilter>('TODO');
  const [disciplineId, setDisciplineId] = useState('');
  const [sort, setSort] = useState<NonNullable<TaskQuery['sort']>>('dueDate');
  const [editingId, setEditingId] = useState<number | null>(null);

  const filters: TaskQuery = {
    ...(status !== 'ALL' ? { status } : {}),
    ...(disciplineId ? { disciplineId: Number(disciplineId) } : {}),
    sort,
  };
  const tasks = useTasks(filters);
  const disciplines = useDisciplines();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const disciplineOptions = disciplines.data ?? [];
  const editing = tasks.data?.find((t) => t.id === editingId);

  function handleDelete(id: number) {
    const task = tasks.data?.find((t) => t.id === id);
    if (task && window.confirm(`Eliminar a tarefa "${task.title}"?`)) deleteTask.mutate(id);
  }

  return (
    <>
      <PageHeader title="Tarefas" />

      <Card className="mb-4">
        <TaskForm
          disciplines={disciplineOptions}
          onSubmit={(v) => createTask.mutateAsync(v)}
        />
      </Card>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Estado" className="inline-flex rounded-lg border border-stone-200 bg-white p-1">
          {statusOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={status === o.value}
              onClick={() => setStatus(o.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                status === o.value ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <SelectField label="Disciplina" value={disciplineId} onChange={(e) => setDisciplineId(e.target.value)} className="min-w-32 flex-1 sm:w-44 sm:flex-none">
          <option value="">Todas</option>
          {disciplineOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code}
            </option>
          ))}
        </SelectField>
        <SelectField label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="min-w-32 flex-1 sm:w-40 sm:flex-none">
          <option value="dueDate">Prazo</option>
          <option value="priority">Prioridade</option>
          <option value="createdAt">Mais recentes</option>
        </SelectField>
      </div>

      <Card>
        {tasks.error ? (
          <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
        ) : tasks.isPending ? (
          <LoadingList rows={5} />
        ) : (
          <>
            {editing && (
              <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
                <TaskForm
                  key={editing.id}
                  disciplines={disciplineOptions}
                  initial={editing}
                  submitLabel="Guardar"
                  onSubmit={async (v) => {
                    await updateTask.mutateAsync({ id: editing.id, ...v });
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            )}
            <TaskList
              tasks={tasks.data}
              onToggle={(t) => updateTask.mutate(t)}
              onEdit={setEditingId}
              onDelete={handleDelete}
              emptyMessage={status === 'DONE' ? 'Ainda não concluíste tarefas.' : 'Sem tarefas pendentes'}
            />
          </>
        )}
      </Card>
    </>
  );
}
