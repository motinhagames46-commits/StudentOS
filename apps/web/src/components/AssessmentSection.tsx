import { assessmentCreateSchema, assessmentTypes, type AssessmentType } from '@studentos/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCreateAssessment, useDeleteAssessment, useUpdateAssessment } from '../hooks/queries';
import { ApiError, errorMessage } from '../lib/api';
import { assessmentTypeLabels, dateInputToIso, formatDate, formatGrade, isoToDateInput } from '../lib/format';
import type { Assessment, Discipline } from '../lib/types';
import { Badge, Button, EmptyState, FormError, IconButton, SelectField, TextField } from './ui';

/** Tabela de avaliações de uma disciplina, com criação e edição (RF07 / HU02). */
export function AssessmentSection({ discipline }: { discipline: Discipline }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const remove = useDeleteAssessment();
  const { weightSum } = discipline.grades;

  function handleDelete(a: Assessment) {
    if (window.confirm(`Eliminar a avaliação "${a.name}"?`)) remove.mutate(a.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          Pesos configurados:{' '}
          <strong className={weightSum === 100 ? 'text-green-700' : 'text-amber-800'}>{formatGrade(weightSum)}%</strong>{' '}
          de 100%
        </p>
        {!adding && (
          <Button variant="secondary" onClick={() => setAdding(true)} disabled={weightSum >= 100}>
            <Plus aria-hidden="true" className="size-4" />
            Adicionar avaliação
          </Button>
        )}
      </div>

      {weightSum < 100 && discipline.assessments.length > 0 && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Configuração de avaliação incompleta: faltam {formatGrade(100 - weightSum)}% de peso.
        </p>
      )}

      {discipline.assessments.length === 0 && !adding ? (
        <EmptyState
          message="Ainda não tens avaliações nesta disciplina."
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Adicionar avaliação
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {discipline.assessments.map((a) =>
            editingId === a.id ? (
              <li key={a.id} className="bg-stone-50 p-4">
                <AssessmentForm disciplineId={discipline.id} initial={a} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900">{a.name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-stone-500">
                    <span>{assessmentTypeLabels[a.type]}</span>
                    <span>Peso {formatGrade(a.weight)}%</span>
                    {a.date && <span>{formatDate(a.date)}</span>}
                    {a.minScore !== null && <span>Mínimo {formatGrade(a.minScore)}</span>}
                    {a.prepMinutes !== null && <span>Tempo de estudo ~{a.prepMinutes} min</span>}
                  </p>
                </div>
                <div className="text-right">
                  {a.score === null ? (
                    <Badge>Pendente</Badge>
                  ) : (
                    <span
                      className={`text-lg font-semibold tabular-nums ${
                        a.minScore !== null && a.score < a.minScore ? 'text-red-700' : 'text-stone-900'
                      }`}
                    >
                      {formatGrade(a.score)}
                    </span>
                  )}
                </div>
                <IconButton label={`Editar "${a.name}"`} onClick={() => setEditingId(a.id)}>
                  <Pencil aria-hidden="true" className="size-4" />
                </IconButton>
                <IconButton
                  label={`Eliminar "${a.name}"`}
                  onClick={() => handleDelete(a)}
                  className="hover:text-red-700"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            ),
          )}
        </ul>
      )}

      {adding && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <AssessmentForm disciplineId={discipline.id} onDone={() => setAdding(false)} />
        </div>
      )}
    </div>
  );
}

function AssessmentForm({
  disciplineId,
  initial,
  onDone,
}: {
  disciplineId: number;
  initial?: Assessment;
  onDone: () => void;
}) {
  const create = useCreateAssessment(disciplineId);
  const update = useUpdateAssessment();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<AssessmentType>(initial?.type ?? 'TEST');
  const [weight, setWeight] = useState(initial ? String(initial.weight) : '');
  const [date, setDate] = useState(isoToDateInput(initial?.date ?? null));
  const [score, setScore] = useState(initial?.score != null ? String(initial.score) : '');
  const [minScore, setMinScore] = useState(initial?.minScore != null ? String(initial.minScore) : '');
  const [prep, setPrep] = useState(initial?.prepMinutes != null ? String(initial.prepMinutes) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const toNumber = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = assessmentCreateSchema.safeParse({
      name,
      type,
      weight: toNumber(weight) ?? undefined,
      date: date ? dateInputToIso(date, '09:00') : null,
      score: toNumber(score),
      minScore: toNumber(minScore),
      prepMinutes: prep.trim() ? Number(prep) : null,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      if (initial) await update.mutateAsync({ id: initial.id, ...parsed.data });
      else await create.mutateAsync(parsed.data);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <TextField
          label="Nome"
          placeholder="Ex.: Teste 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <SelectField label="Tipo" value={type} onChange={(e) => setType(e.target.value as AssessmentType)}>
          {assessmentTypes.map((t) => (
            <option key={t} value={t}>
              {assessmentTypeLabels[t]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField
          label="Peso (%)"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          error={errors.weight}
        />
        <TextField
          label="Data"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
        />
        <TextField
          label="Nota"
          type="number"
          inputMode="decimal"
          min={0}
          max={20}
          step={0.1}
          placeholder="Pendente"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          error={errors.score}
        />
        <TextField
          label="Nota mínima"
          type="number"
          inputMode="decimal"
          min={0}
          max={20}
          step={0.5}
          placeholder="—"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          error={errors.minScore}
        />
      </div>
      <TextField
        label="Tempo de estudo estimado (min)"
        type="number"
        inputMode="numeric"
        min={5}
        step={15}
        placeholder="ex.: 240"
        value={prep}
        onChange={(e) => setPrep(e.target.value)}
        error={errors.prepMinutes}
        hint="Opcional. Se ficar vazio, o plano usa o ritmo pelos ECTS da disciplina."
        className="sm:max-w-xs"
      />
      <FormError message={formError} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {initial ? 'Guardar' : 'Adicionar'}
        </Button>
      </div>
    </form>
  );
}
