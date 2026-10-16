import { disciplineCreateSchema, type DisciplineCreateInput } from '@studentos/shared';
import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../lib/api';
import { disciplineColors } from '../lib/format';
import type { Discipline } from '../lib/types';
import { Button, FormError, TextField } from './ui';

interface DisciplineFormProps {
  initial?: Discipline;
  submitLabel?: string;
  onSubmit: (values: DisciplineCreateInput) => Promise<unknown>;
  onCancel?: () => void;
}

export function DisciplineForm({ initial, submitLabel = 'Criar disciplina', onSubmit, onCancel }: DisciplineFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [ects, setEcts] = useState(initial?.ects ? String(initial.ects) : '');
  const [passingGrade, setPassingGrade] = useState(String(initial?.passingGrade ?? 10));
  const [color, setColor] = useState(initial?.color ?? disciplineColors[0]!);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = disciplineCreateSchema.safeParse({
      name,
      code,
      ects: ects ? Number(ects) : null,
      passingGrade: Number(passingGrade.replace(',', '.')),
      color,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ code: 'Já existe uma disciplina com esta sigla neste semestre' });
      else if (err instanceof ApiError && err.details.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <TextField label="Nome" placeholder="Ex.: Programação Web" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <TextField label="Sigla" placeholder="PW" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} maxLength={12} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="ECTS" type="number" inputMode="numeric" min={1} max={60} value={ects} onChange={(e) => setEcts(e.target.value)} error={errors.ects} hint="Opcional — usado na média global" />
        <TextField label="Nota mínima de aprovação" type="number" inputMode="decimal" min={0} max={20} step={0.5} value={passingGrade} onChange={(e) => setPassingGrade(e.target.value)} error={errors.passingGrade} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {disciplineColors.map((c) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
              <span
                aria-hidden="true"
                className="block size-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-stone-800 peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                style={{ backgroundColor: c }}
              />
              <span className="sr-only">Cor {c}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormError message={formError} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
