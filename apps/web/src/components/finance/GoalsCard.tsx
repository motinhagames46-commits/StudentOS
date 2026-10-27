// Objetivos de poupança com barra de progresso; «Juntar» soma ao que já está poupado.
import { goalCreateSchema } from '@studentos/shared';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAddToGoal, useCreateGoal, useDeleteGoal, useGoals } from '../../hooks/queries';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { formatEuros, parseEuros } from '../../lib/money';
import type { SavingsGoalView } from '@studentos/shared';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { Button, Card, EmptyState, ErrorState, FormError, IconButton, LoadingList, TextField } from '../ui';

export function GoalsCard() {
  const goals = useGoals();
  return (
    <Card title="Objetivos de poupança">
      <div className="space-y-4">
        {goals.error ? (
          <ErrorState message={errorMessage(goals.error)} onRetry={() => void goals.refetch()} />
        ) : goals.isPending ? (
          <LoadingList rows={1} />
        ) : goals.data.length === 0 ? (
          <EmptyState message="Ainda não tens objetivos de poupança." />
        ) : (
          <ul className="space-y-4">
            {goals.data.map((g) => (
              <Goal key={g.id} goal={g} />
            ))}
          </ul>
        )}
        <NewGoal />
      </div>
    </Card>
  );
}

function Goal({ goal }: { goal: SavingsGoalView }) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useAddToGoal();
  const remove = useDeleteGoal();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const percent = Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100));

  async function addSaved(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (!cents) {
      setError('Indica o valor em euros (ex.: 20)');
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ id: goal.id, amountCents: cents });
      setAmount('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function del() {
    const ok = await confirm({ title: `Apagar «${goal.name}»?`, confirmLabel: 'Apagar objetivo' });
    if (!ok) return;
    try {
      await remove.mutateAsync(goal.id);
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  }

  return (
    <li className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-stone-900">{goal.name}</p>
          <p className="text-stone-600">
            {formatEuros(goal.savedCents)} de {formatEuros(goal.targetCents)}
            {goal.deadline && ` · até ${formatDate(`${goal.deadline}T12:00:00Z`)}`}
          </p>
        </div>
        <IconButton label={`Apagar ${goal.name}`} onClick={() => void del()}>
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      <div
        role="progressbar"
        aria-label={`Progresso de ${goal.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2.5 overflow-hidden rounded-full bg-stone-100"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <form onSubmit={(e) => void addSaved(e)} className="flex items-end gap-2" noValidate>
        <TextField
          label={`Juntar a «${goal.name}» (€)`}
          inputMode="decimal"
          value={amount}
          error={error ?? undefined}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" loading={update.isPending}>
          Juntar
        </Button>
      </form>
    </li>
  );
}

function NewGoal() {
  const create = useCreateGoal();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const targetCents = parseEuros(target);
    const parsed = goalCreateSchema.safeParse({
      name,
      targetCents: targetCents ?? Number.NaN,
      deadline: deadline || null,
    });
    if (targetCents === null || !parsed.success) {
      const found = Object.fromEntries(
        parsed.success ? [] : parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      );
      if (targetCents === null) found.targetCents = 'Indica o valor em euros (ex.: 500)';
      setErrors(found);
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      setName('');
      setTarget('');
      setDeadline('');
    } catch {
      // o erro aparece no formulário
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t border-stone-100 pt-4" noValidate>
      <p className="text-sm font-medium text-stone-800">Novo objetivo</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Nome" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Valor (€)"
          inputMode="decimal"
          value={target}
          error={errors.targetCents}
          onChange={(e) => setTarget(e.target.value)}
        />
        <TextField
          label="Prazo (opcional)"
          type="date"
          value={deadline}
          error={errors.deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </div>
      <FormError message={create.error ? errorMessage(create.error) : null} />
      <Button type="submit" variant="secondary" loading={create.isPending}>
        Criar objetivo
      </Button>
    </form>
  );
}
