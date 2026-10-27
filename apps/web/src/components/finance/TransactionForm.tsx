// Registar um movimento: despesa ou receita, valor em euros, data, categoria (criada ao escrever) e nota.
import { transactionCreateSchema, zonedDayKey, DEFAULT_TIMEZONE } from '@studentos/shared';
import { useId, useState, type FormEvent } from 'react';
import { useAddTransaction, useFinanceCategories } from '../../hooks/queries';
import { errorMessage } from '../../lib/api';
import { parseEuros } from '../../lib/money';
import { useToast } from '../Toast';
import { Button, Card, FormError, TextField } from '../ui';

type Kind = 'EXPENSE' | 'INCOME';

/** `month` (aaaa-mm): o mês que se está a ver; a data começa em hoje se for o mês atual, senão no dia 1. */
export function TransactionForm({ month }: { month: string }) {
  const toast = useToast();
  const add = useAddTransaction();
  const categories = useFinanceCategories();
  const listId = useId();
  const [kind, setKind] = useState<Kind>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => {
    const today = zonedDayKey(new Date(), DEFAULT_TIMEZONE);
    return today.startsWith(month) ? today : `${month}-01`;
  });
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseEuros(amount);
    const parsed = transactionCreateSchema.safeParse({
      kind,
      amountCents: amountCents ?? Number.NaN,
      occurredOn: date,
      category: category.trim() || null,
      note: note.trim() || null,
    });
    if (amountCents === null || !parsed.success) {
      const found = Object.fromEntries(
        parsed.success ? [] : parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      );
      if (amountCents === null) found.amountCents = 'Indica o valor em euros (ex.: 12,50)';
      setErrors(found);
      return;
    }
    setErrors({});
    try {
      await add.mutateAsync(parsed.data);
      toast({ message: kind === 'EXPENSE' ? 'Despesa registada.' : 'Receita registada.' });
      setAmount('');
      setNote('');
    } catch {
      // o erro aparece no formulário
    }
  }

  return (
    <Card title="Novo movimento">
      <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <fieldset>
          <legend className="sr-only">Tipo</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['EXPENSE', 'INCOME'] as const).map((k) => (
              <label
                key={k}
                className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-stone-300 text-sm font-medium has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
              >
                <input type="radio" name="kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
                {k === 'EXPENSE' ? 'Despesa' : 'Receita'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Valor (€)"
            inputMode="decimal"
            placeholder="12,50"
            value={amount}
            error={errors.amountCents}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextField
            label="Data"
            type="date"
            value={date}
            error={errors.occurredOn}
            onChange={(e) => setDate(e.target.value)}
          />
          <TextField
            label="Categoria (opcional)"
            list={listId}
            placeholder={kind === 'EXPENSE' ? 'Ex.: Cantina, Transportes' : 'Ex.: Bolsa, Mesada'}
            value={category}
            error={errors.category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id={listId}>
            {categories.data
              ?.filter((c) => c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.name} />
              ))}
          </datalist>
          <TextField
            label="Nota (opcional)"
            value={note}
            error={errors.note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <FormError message={add.error ? errorMessage(add.error) : null} />
        <Button type="submit" loading={add.isPending}>
          Registar
        </Button>
      </form>
    </Card>
  );
}
