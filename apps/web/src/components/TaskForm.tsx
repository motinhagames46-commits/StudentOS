import { taskCreateSchema, taskPriorities, type TaskPriority } from '@studentos/shared';
import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../lib/api';
import { dateInputToIso, isoToDateInput, priorityLabels } from '../lib/format';
import type { DisciplineRef, Task } from '../lib/types';
import { Button, FormError, SelectField, TextField } from './ui';

export interface TaskFormValues {
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  disciplineId: number | null;
}

interface TaskFormProps {
  disciplines: DisciplineRef[];
  initial?: Task;
  submitLabel?: string;
  onSubmit: (values: TaskFormValues) => Promise<unknown>;
  onCancel?: () => void;
}

export function TaskForm({ disciplines, initial, submitLabel = 'Adicionar', onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(isoToDateInput(initial?.dueDate ?? null));
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'MEDIUM');
  const [disciplineId, setDisciplineId] = useState(initial?.disciplineId ? String(initial.disciplineId) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const values: TaskFormValues = {
      title,
      dueDate: date ? dateInputToIso(date) : null,
      priority,
      disciplineId: disciplineId ? Number(disciplineId) : null,
    };

    const parsed = taskCreateSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }

    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({ ...values, title: parsed.data.title });
      if (!initial) {
        setTitle('');
        setDate('');
        setPriority('MEDIUM');
      }
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <TextField
          label="Nova tarefa"
          placeholder="Ex.: Resumo do capítulo 3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={200}
          autoFocus={Boolean(initial)}
        />
        <TextField
          label="Prazo"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.dueDate}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <SelectField
          label="Disciplina"
          value={disciplineId}
          onChange={(e) => setDisciplineId(e.target.value)}
          error={errors.disciplineId}
        >
          <option value="">Sem disciplina</option>
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          {taskPriorities.map((p) => (
            <option key={p} value={p}>
              {priorityLabels[p]}
            </option>
          ))}
        </SelectField>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button type="submit" loading={submitting} className="flex-1 sm:flex-none">
            {submitLabel}
          </Button>
        </div>
      </div>
      <FormError message={formError} />
    </form>
  );
}
