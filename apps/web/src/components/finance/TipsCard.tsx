// Dicas de poupança da IA: só com médias agregadas, e mostra exatamente o que foi enviado.
import { Lightbulb } from 'lucide-react';
import { useAiStatus, useCreateInsight, useLatestInsight } from '../../hooks/queries';
import { errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { formatEuros } from '../../lib/money';
import { AiUnavailable } from '../AiUnavailable';
import { Button, Card, FormError, Skeleton } from '../ui';

export function TipsCard() {
  const ai = useAiStatus();
  const latest = useLatestInsight();
  const create = useCreateInsight();

  if (ai.isPending) return <Skeleton className="h-32" />;
  if (ai.data?.status !== 'ENABLED') return <AiUnavailable status={ai.data?.status} action="pedir dicas de poupança" />;

  const insight = latest.data;
  return (
    <Card title="Dicas de poupança">
      <div className="space-y-4 text-sm">
        {insight && (
          <>
            <ul className="space-y-3">
              {insight.tips.map((tip, i) => (
                <li key={i} className="flex gap-2">
                  <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    <span className="font-medium text-stone-900">{tip.title}. </span>
                    <span className="text-stone-700">{tip.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <details className="rounded-lg bg-stone-50 p-3 text-xs text-stone-700">
              <summary className="cursor-pointer font-medium">
                O que foi enviado à IA ({formatDateTime(insight.createdAt)})
              </summary>
              <ul className="mt-2 space-y-1">
                <li>
                  Médias de {insight.basedOn.months} {insight.basedOn.months === 1 ? 'mês' : 'meses'} completos
                </li>
                <li>Receitas por mês: {formatEuros(insight.basedOn.avgIncomeCents)}</li>
                <li>Despesas por mês: {formatEuros(insight.basedOn.avgExpenseCents)}</li>
                {insight.basedOn.expenseByCategory.map((c) => (
                  <li key={c.category}>
                    {c.category}: {formatEuros(c.avgCents)} por mês
                  </li>
                ))}
                {insight.basedOn.goals.length > 0 && (
                  <li>{insight.basedOn.goals.length} objetivo(s): valores e meses até ao prazo, sem nomes</li>
                )}
              </ul>
            </details>
          </>
        )}
        <FormError message={create.error ? errorMessage(create.error) : null} />
        <div aria-live="polite" className="flex flex-wrap items-center gap-3">
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            {insight ? 'Gerar novas dicas' : 'Gerar dicas'}
          </Button>
          {create.isPending && <span className="text-stone-600">A pensar…</span>}
        </div>
        <p className="text-xs text-stone-600">
          Só vão para a Google (Gemini) médias por mês e por categoria (com os nomes das categorias) dos últimos meses
          completos: nem notas, nem datas, nem nomes de objetivos. São dicas gerais de poupança, não aconselhamento
          financeiro nem de investimento.
        </p>
      </div>
    </Card>
  );
}
