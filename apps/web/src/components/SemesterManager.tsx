import { semesterCreateSchema, type SemesterCreateInput } from '@studentos/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCreateSemester, useDeleteSemester, useSemesters, useUpdateSemester } from '../hooks/queries';
import { ApiError, errorMessage } from '../lib/api';
import { dateOnlyToIso, formatDate, isoToDateOnly } from '../lib/format';
import type { Semester } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormError,
  IconButton,
  LoadingList,
  SelectField,
  TextField,
} from './ui';

/** Seletor do semestre ativo (RF03). As disciplinas novas vão para o semestre ativo. */
export function ActiveSemesterSelect({ className }: { className?: string }) {
  const { data } = useSemesters();
  const update = useUpdateSemester();
  const active = data?.find((s) => s.isActive);

  return (
    <div className={className}>
      <SelectField
        label="Semestre ativo"
        value={active ? String(active.id) : ''}
        disabled={!data || data.length === 0 || update.isPending}
        onChange={(e) => update.mutate({ id: Number(e.target.value), isActive: true })}
      >
        {!active && <option value="">{data?.length ? 'Escolhe um semestre' : 'Sem semestres'}</option>}
        {data?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </SelectField>
      <FormError message={update.error ? errorMessage(update.error) : null} />
    </div>
  );
}

/** Lista de semestres com criação, edição e eliminação (RF03). */
export function SemesterManager({ onClose }: { onClose: () => void }) {
  const { data, isPending, error, refetch } = useSemesters();
  const create = useCreateSemester();
  const update = useUpdateSemester();
  const remove = useDeleteSemester();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(s: Semester) {
    const ok = window.confirm(
      `Eliminar "${s.label}"? As disciplinas deste semestre não são eliminadas, mas ficam sem semestre.`,
    );
    if (!ok) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(s.id);
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  }

  return (
    <Card
      title="Semestres"
      className="mb-4"
      action={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <LoadingList rows={2} />
      ) : (
        <div className="space-y-4">
          {data.length === 0 && editingId !== 'new' && <EmptyState message="Ainda não tens semestres." />}
          <ul className="divide-y divide-stone-100">
            {data.map((s) =>
              editingId === s.id ? (
                <li key={s.id} className="py-3">
                  <SemesterForm
                    initial={s}
                    submitLabel="Guardar"
                    onSubmit={async (v) => {
                      await update.mutateAsync({ id: s.id, ...v });
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-900">
                      {s.label}
                      {s.isActive && <Badge tone="accent">Ativo</Badge>}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatDate(s.startDate)} – {formatDate(s.endDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!s.isActive && (
                      <Button
                        variant="ghost"
                        onClick={() => update.mutate({ id: s.id, isActive: true })}
                        disabled={update.isPending}
                      >
                        Ativar
                      </Button>
                    )}
                    <IconButton label={`Editar ${s.label}`} onClick={() => setEditingId(s.id)}>
                      <Pencil aria-hidden="true" className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Eliminar ${s.label}`}
                      onClick={() => handleDelete(s)}
                      className="hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </IconButton>
                  </div>
                </li>
              ),
            )}
          </ul>
          <FormError message={deleteError} />

          {editingId === 'new' ? (
            <div className="rounded-lg border border-stone-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-stone-900">Novo semestre</h3>
              <SemesterForm
                submitLabel="Criar semestre"
                showActiveToggle
                onSubmit={async (v) => {
                  await create.mutateAsync(v);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setEditingId('new')}>
              <Plus aria-hidden="true" className="size-4" />
              Novo semestre
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

interface SemesterFormProps {
  initial?: Semester;
  submitLabel: string;
  showActiveToggle?: boolean;
  onSubmit: (values: SemesterCreateInput) => Promise<unknown>;
  onCancel: () => void;
}

function SemesterForm({ initial, submitLabel, showActiveToggle = false, onSubmit, onCancel }: SemesterFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [startDate, setStartDate] = useState(initial ? isoToDateOnly(initial.startDate) : '');
  const [endDate, setEndDate] = useState(initial ? isoToDateOnly(initial.endDate) : '');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = semesterCreateSchema.safeParse({
      label,
      startDate: startDate ? dateOnlyToIso(startDate) : undefined,
      endDate: endDate ? dateOnlyToIso(endDate) : undefined,
      ...(showActiveToggle ? { isActive } : {}),
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.code === 'invalid_type' ? 'Indica a data' : i.message]),
        ),
      );
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <TextField
        label="Nome"
        placeholder="Ex.: 2026/27 — 2.º semestre"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        error={errors.label}
        maxLength={60}
        autoFocus
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Início"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={errors.startDate}
        />
        <TextField
          label="Fim"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={errors.endDate}
        />
      </div>
      {showActiveToggle && (
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded border-stone-300 accent-accent"
          />
          Definir como semestre ativo
        </label>
      )}
      <FormError message={formError} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
