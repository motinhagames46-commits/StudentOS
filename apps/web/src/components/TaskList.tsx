import { isOverdue } from '@studentos/shared';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { priorityLabels, relativeDay, formatDate } from '../lib/format';
import type { Task } from '../lib/types';
import { Badge, DisciplineChip, EmptyState, IconButton } from './ui';

type TaskLike = Pick<Task, 'id' | 'title' | 'status'> & Partial<Task>;

interface TaskListProps {
  tasks: TaskLike[];
  onToggle?: (task: { id: number; status: Task['status'] }) => void;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  emptyMessage?: string;
  compact?: boolean;
}

export function TaskList({ tasks, onToggle, onEdit, onDelete, emptyMessage = 'Sem tarefas pendentes', compact = false }: TaskListProps) {
  if (tasks.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <ul className="divide-y divide-stone-100">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} compact={compact} />
      ))}
    </ul>
  );
}

function TaskItem({
  task,
  onToggle,
  onEdit,
  onDelete,
  compact,
}: {
  task: TaskLike;
  onToggle?: TaskListProps['onToggle'];
  onEdit?: TaskListProps['onEdit'];
  onDelete?: TaskListProps['onDelete'];
  compact: boolean;
}) {
  const done = task.status === 'DONE';
  const overdue = isOverdue({ status: task.status, dueDate: task.dueDate ?? null });

  return (
    <li className="flex items-start gap-3 py-2.5">
      {onToggle && (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Reabrir "${task.title}"` : `Marcar "${task.title}" como concluída`}
          onClick={() => onToggle({ id: task.id, status: done ? 'TODO' : 'DONE' })}
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            done ? 'border-accent bg-accent text-white' : 'border-stone-300 bg-white hover:border-accent'
          }`}
        >
          {done && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
          {task.discipline && <DisciplineChip discipline={task.discipline} />}
          {task.dueDate && (
            <span className={overdue ? 'font-medium text-red-700' : undefined} title={formatDate(task.dueDate)}>
              {overdue ? `Em atraso · ${relativeDay(task.dueDate)}` : relativeDay(task.dueDate)}
            </span>
          )}
          {!compact && task.priority === 'HIGH' && !done && <Badge tone="amber">Prioridade {priorityLabels.HIGH.toLowerCase()}</Badge>}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="flex shrink-0 items-center">
          {onEdit && (
            <IconButton label={`Editar "${task.title}"`} onClick={() => onEdit(task.id)}>
              <Pencil aria-hidden="true" className="size-4" />
            </IconButton>
          )}
          {onDelete && (
            <IconButton label={`Eliminar "${task.title}"`} onClick={() => onDelete(task.id)} className="hover:text-red-700">
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          )}
        </div>
      )}
    </li>
  );
}
