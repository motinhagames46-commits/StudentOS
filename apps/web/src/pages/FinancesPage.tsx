import { DEFAULT_TIMEZONE, zonedDayKey } from '@studentos/shared';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { GoalsCard } from '../components/finance/GoalsCard';
import { TipsCard } from '../components/finance/TipsCard';
import { TransactionForm } from '../components/finance/TransactionForm';
import { useToast } from '../components/Toast';
import { Card, EmptyState, ErrorState, IconButton, LoadingList, PageHeader } from '../components/ui';
import { useDeleteTransaction, useFinanceSummary, useTransactions } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { formatEuros, monthLabel, shiftMonth } from '../lib/money';

/** Finanças: movimentos do mês, resumo por categoria, objetivos de poupança e dicas (IA, opcional). */
export function FinancesPage() {
  const [month, setMonth] = useState(() => zonedDayKey(new Date(), DEFAULT_TIMEZONE).slice(0, 7));
  const summary = useFinanceSummary(month);
  const label = monthLabel(month);

  return (
    <>
      <PageHeader
        title="Finanças"
        subtitle="Regista receitas e despesas, acompanha os objetivos de poupança e pede dicas para gastar menos."
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <IconButton label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </IconButton>
          <h2 className="text-base font-semibold text-stone-900 first-letter:uppercase" aria-live="polite">
            {label}
          </h2>
          <IconButton label="Mês seguinte" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden="true" className="size-5" />
          </IconButton>
        </div>

        {summary.error ? (
          <ErrorState message={errorMessage(summary.error)} onRetry={() => void summary.refetch()} />
        ) : summary.isPending ? (
          <LoadingList rows={1} />
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Receitas', cents: summary.data.incomeCents, tone: 'text-green-800' },
              { label: 'Despesas', cents: summary.data.expenseCents, tone: 'text-red-800' },
              {
                label: 'Saldo',
                cents: summary.data.incomeCents - summary.data.expenseCents,
                tone: summary.data.incomeCents >= summary.data.expenseCents ? 'text-green-800' : 'text-red-800',
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-panel-border bg-white px-2 py-3">
                <dt className="text-xs text-stone-600">{tile.label}</dt>
                <dd className={`mt-1 text-sm font-semibold tabular-nums sm:text-base ${tile.tone}`}>
                  {formatEuros(tile.cents)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* Mudar de mês recomeça o formulário com a data desse mês. */}
        <TransactionForm key={month} month={month} />
        {summary.data && <CategoryBars summary={summary.data} />}
        <TransactionList month={month} label={label} />
        <GoalsCard />
        <TipsCard />
        {summary.data && <LastMonths months={summary.data.months} />}
      </div>
    </>
  );
}

function CategoryBars({ summary }: { summary: NonNullable<ReturnType<typeof useFinanceSummary>['data']> }) {
  const expenses = summary.byCategory.filter((c) => c.kind === 'EXPENSE');
  if (expenses.length === 0) return null;
  const max = Math.max(...expenses.map((c) => c.cents));
  return (
    <Card title="Despesas por categoria">
      <ul className="space-y-2 text-sm">
        {expenses.map((c) => (
          <li key={c.category ?? ''}>
            <div className="flex justify-between gap-2">
              <span className="text-stone-700">{c.category ?? 'Sem categoria'}</span>
              <span className="font-medium tabular-nums">{formatEuros(c.cents)}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2 rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(c.cents / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TransactionList({ month, label }: { month: string; label: string }) {
  const transactions = useTransactions(month);
  const remove = useDeleteTransaction();
  const confirm = useConfirm();
  const toast = useToast();

  async function del(id: number, what: string) {
    const ok = await confirm({ title: `Apagar ${what}?`, confirmLabel: 'Apagar movimento' });
    if (!ok) return;
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  }

  return (
    <Card title="Movimentos">
      {transactions.error ? (
        <ErrorState message={errorMessage(transactions.error)} onRetry={() => void transactions.refetch()} />
      ) : transactions.isPending ? (
        <LoadingList rows={2} />
      ) : transactions.data.length === 0 ? (
        <EmptyState message={`Sem movimentos em ${label}.`} />
      ) : (
        <ul className="-my-2 divide-y divide-stone-100">
          {transactions.data.map((t) => {
            const amount = `${t.kind === 'EXPENSE' ? '−' : '+'}${formatEuros(t.amountCents)}`;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-12 shrink-0 text-xs text-stone-500 tabular-nums">
                  {t.occurredOn.slice(8, 10)}/{t.occurredOn.slice(5, 7)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-stone-900">{t.category ?? 'Sem categoria'}</span>
                  {t.note && <span className="block truncate text-xs text-stone-500">{t.note}</span>}
                </span>
                <span
                  className={`font-medium tabular-nums ${t.kind === 'EXPENSE' ? 'text-red-800' : 'text-green-800'}`}
                >
                  {amount}
                </span>
                <IconButton
                  label={`Apagar ${amount} de ${t.occurredOn}`}
                  onClick={() => void del(t.id, `${amount} (${t.category ?? 'sem categoria'})`)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function LastMonths({ months }: { months: { month: string; incomeCents: number; expenseCents: number }[] }) {
  if (months.every((m) => m.incomeCents === 0 && m.expenseCents === 0)) return null;
  return (
    <Card title="Últimos 6 meses" collapsible>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-600">
            <th className="py-1 font-medium">Mês</th>
            <th className="py-1 text-right font-medium">Receitas</th>
            <th className="py-1 text-right font-medium">Despesas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 tabular-nums">
          {months.map((m) => (
            <tr key={m.month}>
              <td className="py-1.5 first-letter:uppercase">{monthLabel(m.month)}</td>
              <td className="py-1.5 text-right text-green-800">{formatEuros(m.incomeCents)}</td>
              <td className="py-1.5 text-right text-red-800">{formatEuros(m.expenseCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
