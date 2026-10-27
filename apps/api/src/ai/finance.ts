// Dicas de poupança (passo 5 da IA). A IA só recebe médias agregadas dos últimos meses completos:
// nada de notas, datas exatas, nomes de objetivos ou movimentos soltos. Só dicas de poupança e boas práticas.
import type { FinanceAggregates, FinanceTip } from '@studentos/shared';
import { z } from 'zod';
import type { AiProvider } from './provider.js';

/** Meses completos usados nas médias. */
export const AGGREGATE_MONTHS = 3;

interface TransactionLike {
  kind: 'EXPENSE' | 'INCOME';
  amountCents: number;
  /** aaaa-mm-dd */
  occurredOn: string;
  category: string | null;
}

/** aaaa-mm do mês `offset` meses antes de `month` (aaaa-mm). */
export function shiftMonth(month: string, offset: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Médias por mês dos `AGGREGATE_MONTHS` meses completos antes de `currentMonth`, contando só os meses com
 * movimentos. Função pura: o que sai daqui é exatamente o que é enviado e mostrado.
 */
export function aggregateFinances(
  transactions: TransactionLike[],
  goals: { targetCents: number; savedCents: number; deadline: string | null }[],
  currentMonth: string,
): FinanceAggregates {
  const window = new Set(Array.from({ length: AGGREGATE_MONTHS }, (_, i) => shiftMonth(currentMonth, -(i + 1))));
  const inWindow = transactions.filter((t) => window.has(t.occurredOn.slice(0, 7)));
  const months = new Set(inWindow.map((t) => t.occurredOn.slice(0, 7))).size;
  const avg = (cents: number) => (months ? Math.round(cents / months) : 0);
  const sum = (kind: TransactionLike['kind']) =>
    inWindow.filter((t) => t.kind === kind).reduce((s, t) => s + t.amountCents, 0);

  const byCategory = new Map<string, number>();
  for (const t of inWindow) {
    if (t.kind !== 'EXPENSE') continue;
    const key = t.category ?? 'Sem categoria';
    byCategory.set(key, (byCategory.get(key) ?? 0) + t.amountCents);
  }
  const income = sum('INCOME');
  const expense = sum('EXPENSE');
  return {
    months,
    avgIncomeCents: avg(income),
    avgExpenseCents: avg(expense),
    expenseByCategory: [...byCategory]
      .map(([category, cents]) => ({ category, avgCents: avg(cents) }))
      .sort((a, b) => b.avgCents - a.avgCents),
    savingsRatePercent: income > 0 ? Math.round(((income - expense) / income) * 100) : null,
    goals: goals.map((g) => ({
      targetCents: g.targetCents,
      savedCents: g.savedCents,
      monthsLeft: g.deadline ? monthsBetween(currentMonth, g.deadline.slice(0, 7)) : null,
    })),
  };
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
}

const tipsSchema = z.object({
  tips: z.array(
    z.object({
      title: z.string().describe('Título curto da dica'),
      body: z.string().describe('Uma a três frases concretas, ligadas aos números'),
    }),
  ),
});

const TIPS_PROMPT = [
  'Dás dicas de poupança e boas práticas de gestão do dinheiro a um estudante do ensino superior em Portugal,',
  'em português de Portugal. Usa só os números dados (médias mensais em euros) e liga cada dica a eles.',
  'Nunca recomendes investimentos, ações, fundos, criptomoedas, créditos, seguros, bancos ou marcas concretas:',
  'não és consultor financeiro. Fica-te por orçamento, hábitos de consumo, despesas fixas, subscrições,',
  'alimentação, transportes, apoios ao estudante e o ritmo para os objetivos de poupança.',
  'Dá entre 3 e 5 dicas.',
].join('\n');

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/** Texto enviado: só os agregados, já formatados. */
export function describeAggregates(a: FinanceAggregates): string {
  const lines = [
    `Meses considerados: ${a.months}`,
    `Receitas médias por mês: ${euros(a.avgIncomeCents)}`,
    `Despesas médias por mês: ${euros(a.avgExpenseCents)}`,
    a.savingsRatePercent === null ? 'Taxa de poupança: sem receitas' : `Taxa de poupança: ${a.savingsRatePercent}%`,
    'Despesas médias por categoria:',
    ...a.expenseByCategory.map((c) => `- ${c.category}: ${euros(c.avgCents)}`),
    'Objetivos de poupança:',
    ...(a.goals.length
      ? a.goals.map(
          (g, i) =>
            `- Objetivo ${i + 1}: ${euros(g.savedCents)} de ${euros(g.targetCents)}` +
            (g.monthsLeft === null
              ? ', sem prazo'
              : g.monthsLeft < 0
                ? ', prazo já passou'
                : `, prazo daqui a ${g.monthsLeft} mês(es)`),
        )
      : ['- nenhum']),
  ];
  return lines.join('\n');
}

export async function savingsTips(ai: AiProvider, aggregates: FinanceAggregates): Promise<FinanceTip[]> {
  const { tips } = await ai.generateJson(tipsSchema, [{ text: describeAggregates(aggregates) }], {
    system: TIPS_PROMPT,
  });
  return tips
    .map((t) => ({ title: t.title.trim().slice(0, 80), body: t.body.trim().slice(0, 500) }))
    .filter((t) => t.title && t.body)
    .slice(0, 5);
}
