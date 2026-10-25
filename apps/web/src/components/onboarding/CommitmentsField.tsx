import { Plus, Trash2 } from 'lucide-react';
import { WEEKDAY_NAMES, type Commitment } from '../../lib/onboarding';
import { Button, IconButton, SelectField, TextField } from '../ui';

export interface CommitmentRow extends Commitment {
  key: number;
}

let nextKey = 0;
export const emptyCommitment = (): CommitmentRow => ({ key: nextKey++, title: '', weekday: 1, start: '', end: '' });

/** Valida as linhas preenchidas; devolve erros por `${key}.campo`. */
export function commitmentErrors(rows: CommitmentRow[]): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const r of rows) {
    if (!r.title.trim()) errs[`${r.key}.title`] = 'Indica o compromisso';
    if (!r.start) errs[`${r.key}.start`] = 'Indica a hora';
    if (!r.end) errs[`${r.key}.end`] = 'Indica a hora';
    else if (r.start && r.end <= r.start) errs[`${r.key}.end`] = 'Tem de ser depois do início';
  }
  return errs;
}

/** Compromissos fixos semanais (trabalho, treino…), opcionais: o planeador não marca estudo por cima. */
export function CommitmentsField({
  rows,
  onChange,
  errors,
}: {
  rows: CommitmentRow[];
  onChange: (rows: CommitmentRow[]) => void;
  errors: Record<string, string>;
}) {
  const update = (key: number, patch: Partial<Commitment>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const n = (i: number, label: string) => (i === 0 ? label : `${label} ${i + 1}`);

  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-medium text-stone-700">Compromissos fixos (opcional)</legend>
      <p className="mt-1 text-sm text-stone-600">
        Trabalho, treinos, explicações… O plano nunca marca estudo por cima. Mudas no Calendário quando quiseres.
      </p>
      {rows.length > 0 && (
        <ul className="mt-3 space-y-3">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_8rem_6rem_6rem_auto]"
            >
              <TextField
                className="col-span-3 sm:col-span-1"
                label={n(i, 'Compromisso')}
                placeholder="Ex.: Trabalho"
                value={r.title}
                onChange={(e) => update(r.key, { title: e.target.value })}
                error={errors[`${r.key}.title`]}
              />
              <SelectField
                className="col-span-3 sm:col-span-1"
                label={n(i, 'Dia')}
                value={String(r.weekday)}
                onChange={(e) => update(r.key, { weekday: Number(e.target.value) })}
              >
                {WEEKDAY_NAMES.map((name, d) => (
                  <option key={name} value={d + 1}>
                    {name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={n(i, 'Das')}
                type="time"
                value={r.start}
                onChange={(e) => update(r.key, { start: e.target.value })}
                error={errors[`${r.key}.start`]}
              />
              <TextField
                label={n(i, 'Às')}
                type="time"
                value={r.end}
                onChange={(e) => update(r.key, { end: e.target.value })}
                error={errors[`${r.key}.end`]}
              />
              <IconButton
                label={`Remover o compromisso ${i + 1}`}
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="secondary" className="mt-3" onClick={() => onChange([...rows, emptyCommitment()])}>
        <Plus aria-hidden="true" className="size-4" />
        Adicionar compromisso
      </Button>
    </fieldset>
  );
}
