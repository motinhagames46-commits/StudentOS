import { Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useUpdateDiscipline } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import type { Discipline } from '../lib/types';
import { Button, Card, FormError, IconButton, TextField } from './ui';

type Tone = 'neutral' | 'warn' | 'danger';

/** Mensagem e tom das faltas face ao limite do regulamento da UC. */
export function absenceSummary(absences: number, limit: number | null): { text: string; tone: Tone } {
  if (limit === null)
    return { text: 'Indica o limite de faltas da UC para seres avisado antes de o atingires.', tone: 'neutral' };
  const left = limit - absences;
  if (left < 0) return { text: `Ultrapassaste o limite de faltas em ${-left}.`, tone: 'danger' };
  if (left === 0) return { text: 'Chegaste ao limite de faltas: mais uma e ultrapassas.', tone: 'danger' };
  if (left === 1) return { text: 'Só podes faltar mais uma vez.', tone: 'warn' };
  return { text: `Podes faltar mais ${left} vezes.`, tone: 'neutral' };
}

const toneClass: Record<Tone, string> = {
  neutral: 'text-stone-700',
  warn: 'rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900',
  danger: 'rounded-lg bg-red-50 px-3 py-2 font-medium text-red-800',
};

/** Contador de faltas por UC (pesquisa de mercado, n.º 3), com aviso perto do limite. */
export function AbsencesCard({ discipline: d }: { discipline: Discipline }) {
  const update = useUpdateDiscipline();
  const [limit, setLimit] = useState(d.absenceLimit === null ? '' : String(d.absenceLimit));
  const [limitError, setLimitError] = useState<string | null>(null);
  const summary = absenceSummary(d.absences, d.absenceLimit);

  function saveLimit(e: FormEvent) {
    e.preventDefault();
    const value = limit.trim() === '' ? null : Number(limit);
    if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 999)) {
      setLimitError('Indica um número inteiro entre 1 e 999, ou deixa em branco');
      return;
    }
    setLimitError(null);
    update.mutate({ id: d.id, absenceLimit: value });
  }

  return (
    <Card title="Faltas">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <IconButton
            label="Retirar uma falta"
            disabled={d.absences === 0 || update.isPending}
            onClick={() => update.mutate({ id: d.id, absences: d.absences - 1 })}
            className="border border-stone-300 disabled:opacity-40"
          >
            <Minus aria-hidden="true" className="size-4" />
          </IconButton>
          <p className="min-w-24 text-center" aria-live="polite">
            <span className="text-3xl font-semibold tabular-nums text-stone-900">{d.absences}</span>{' '}
            <span className="text-sm text-stone-600">
              {d.absences === 1 ? 'falta' : 'faltas'}
              {d.absenceLimit !== null && ` de ${d.absenceLimit}`}
            </span>
          </p>
          <IconButton
            label="Registar uma falta"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: d.id, absences: d.absences + 1 })}
            className="border border-stone-300"
          >
            <Plus aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
        <form onSubmit={saveLimit} noValidate className="flex items-end gap-2">
          <TextField
            label="Limite de faltas"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            error={limitError ?? undefined}
            className="w-32"
          />
          <Button type="submit" variant="secondary" loading={update.isPending}>
            Guardar
          </Button>
        </form>
      </div>
      <p role="status" className={`mt-3 text-sm ${toneClass[summary.tone]}`}>
        {summary.text}
      </p>
      <p className="mt-2 text-xs text-stone-600">
        O limite está no regulamento ou na ficha da UC. Conta as faltas na mesma unidade do limite (aulas ou horas).
      </p>
      <FormError message={update.isError ? errorMessage(update.error) : null} />
    </Card>
  );
}
