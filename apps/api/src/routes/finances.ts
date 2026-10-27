// Finanças (passo 5): movimentos, resumo por mês, objetivos de poupança e dicas da IA a partir de agregados.
// Tudo por dono (404 para dados de outra conta); só as dicas pedem a IA ativa.
import { Router } from 'express';
import {
  DEFAULT_TIMEZONE,
  MAX_CENTS,
  goalAddSchema,
  goalCreateSchema,
  idParamSchema,
  monthQuerySchema,
  transactionCreateSchema,
  zonedDayKey,
  type FinanceAggregates,
  type FinanceInsightView,
  type FinanceSummary,
  type FinanceTip,
  type FinanceTransactionView,
  type SavingsGoalView,
} from '@studentos/shared';
import { aiProvider } from '../ai/access.js';
import { aggregateFinances, AGGREGATE_MONTHS, savingsTips, shiftMonth } from '../ai/finance.js';
import type { FinanceInsight, SavingsGoal } from '../generated/prisma/client.js';
import { HttpError, notFound, parse, validationError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { requireAi } from '../middleware/ai.js';

export const financesRouter = Router();

const day = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (month: string) => new Date(`${month}-01T00:00:00Z`);
const currentMonth = () => zonedDayKey(new Date(), DEFAULT_TIMEZONE).slice(0, 7);

/** Movimentos de [from, to) com o nome da categoria. */
async function transactionsBetween(userId: number, from: string, to: string): Promise<FinanceTransactionView[]> {
  const rows = await prisma.financeTransaction.findMany({
    where: { userId, occurredOn: { gte: monthStart(from), lt: monthStart(to) } },
    include: { category: { select: { name: true } } },
    orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
  });
  return rows.map((t) => ({
    id: t.id,
    kind: t.kind,
    amountCents: t.amountCents,
    occurredOn: day(t.occurredOn),
    note: t.note,
    category: t.category?.name ?? null,
  }));
}

financesRouter.get('/transactions', async (req, res) => {
  const month = parse(monthQuerySchema, req.query).month ?? currentMonth();
  res.json(await transactionsBetween(req.userId, month, shiftMonth(month, 1)));
});

financesRouter.post('/transactions', async (req, res) => {
  const input = parse(transactionCreateSchema, req.body);
  const name = input.category?.trim();
  // A categoria é da conta e do tipo (despesa ou receita); criada à primeira vez que é usada.
  const category = name
    ? await prisma.financeCategory.upsert({
        where: { userId_kind_name: { userId: req.userId, kind: input.kind, name } },
        create: { userId: req.userId, kind: input.kind, name },
        update: {},
      })
    : null;
  const t = await prisma.financeTransaction.create({
    data: {
      userId: req.userId,
      kind: input.kind,
      amountCents: input.amountCents,
      occurredOn: new Date(`${input.occurredOn}T00:00:00Z`),
      note: input.note || null,
      categoryId: category?.id ?? null,
    },
  });
  const view: FinanceTransactionView = {
    id: t.id,
    kind: t.kind,
    amountCents: t.amountCents,
    occurredOn: day(t.occurredOn),
    note: t.note,
    category: category?.name ?? null,
  };
  res.status(201).json(view);
});

financesRouter.delete('/transactions/:id', async (req, res) => {
  const { count } = await prisma.financeTransaction.deleteMany({
    where: { id: parse(idParamSchema, req.params.id), userId: req.userId },
  });
  if (!count) throw notFound('TRANSACTION_NOT_FOUND', 'Movimento não encontrado');
  res.status(204).end();
});

financesRouter.get('/categories', async (req, res) => {
  const categories = await prisma.financeCategory.findMany({
    where: { userId: req.userId },
    orderBy: { name: 'asc' },
    select: { id: true, kind: true, name: true },
  });
  res.json(categories);
});

// GET /api/finances/summary?month= — totais do mês, por categoria, e os 6 meses até ele.
financesRouter.get('/summary', async (req, res) => {
  const month = parse(monthQuerySchema, req.query).month ?? currentMonth();
  const first = shiftMonth(month, -5);
  const all = await transactionsBetween(req.userId, first, shiftMonth(month, 1));
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(first, i)).map((m) => ({
    month: m,
    incomeCents: 0,
    expenseCents: 0,
  }));
  const byCategory = new Map<string, FinanceSummary['byCategory'][number]>();
  for (const t of all) {
    const m = months.find((x) => x.month === t.occurredOn.slice(0, 7))!;
    if (t.kind === 'INCOME') m.incomeCents += t.amountCents;
    else m.expenseCents += t.amountCents;
    if (t.occurredOn.slice(0, 7) !== month) continue;
    const key = `${t.kind}:${t.category ?? ''}`;
    const row = byCategory.get(key) ?? { kind: t.kind, category: t.category, cents: 0 };
    row.cents += t.amountCents;
    byCategory.set(key, row);
  }
  const current = months[months.length - 1]!;
  const summary: FinanceSummary = {
    month,
    incomeCents: current.incomeCents,
    expenseCents: current.expenseCents,
    byCategory: [...byCategory.values()].sort((a, b) => b.cents - a.cents),
    months,
  };
  res.json(summary);
});

const goalView = (g: SavingsGoal): SavingsGoalView => ({
  id: g.id,
  name: g.name,
  targetCents: g.targetCents,
  savedCents: g.savedCents,
  deadline: g.deadline ? day(g.deadline) : null,
});
const goalData = (input: { deadline?: string | null }) =>
  input.deadline === undefined ? {} : { deadline: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : null };

financesRouter.get('/goals', async (req, res) => {
  const goals = await prisma.savingsGoal.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'asc' } });
  res.json(goals.map(goalView));
});

financesRouter.post('/goals', async (req, res) => {
  const input = parse(goalCreateSchema, req.body);
  const goal = await prisma.savingsGoal.create({ data: { ...input, ...goalData(input), userId: req.userId } });
  res.status(201).json(goalView(goal));
});

// POST /api/finances/goals/:id/add — soma no servidor (sem perder valores entre separadores), até ao máximo.
financesRouter.post('/goals/:id/add', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { amountCents } = parse(goalAddSchema, req.body);
  const goal = await prisma.savingsGoal.findFirst({ where: { id, userId: req.userId } });
  if (!goal) throw notFound('GOAL_NOT_FOUND', 'Objetivo não encontrado');
  const { count } = await prisma.savingsGoal.updateMany({
    where: { id, userId: req.userId, savedCents: { lte: MAX_CENTS - amountCents } },
    data: { savedCents: { increment: amountCents } },
  });
  if (!count) throw validationError([{ path: 'amountCents', message: 'O valor poupado ficaria demasiado alto' }]);
  res.json(goalView(await prisma.savingsGoal.findUniqueOrThrow({ where: { id } })));
});

financesRouter.delete('/goals/:id', async (req, res) => {
  const { count } = await prisma.savingsGoal.deleteMany({
    where: { id: parse(idParamSchema, req.params.id), userId: req.userId },
  });
  if (!count) throw notFound('GOAL_NOT_FOUND', 'Objetivo não encontrado');
  res.status(204).end();
});

const insightView = (i: FinanceInsight): FinanceInsightView => ({
  id: i.id,
  createdAt: i.createdAt.toISOString(),
  tips: i.tips as unknown as FinanceTip[],
  basedOn: i.basedOn as unknown as FinanceAggregates,
});

financesRouter.get('/insights/latest', async (req, res) => {
  const latest = await prisma.financeInsight.findFirst({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(latest ? insightView(latest) : null);
});

// POST /api/finances/insights — dicas de poupança a partir das médias dos últimos meses completos.
financesRouter.post('/insights', requireAi, async (req, res) => {
  const month = currentMonth();
  const [transactions, goals] = await Promise.all([
    transactionsBetween(req.userId, shiftMonth(month, -AGGREGATE_MONTHS), month),
    prisma.savingsGoal.findMany({ where: { userId: req.userId } }),
  ]);
  const aggregates = aggregateFinances(transactions, goals.map(goalView), month);
  if (aggregates.months === 0) {
    throw new HttpError(
      422,
      'NOT_ENOUGH_DATA',
      'Regista pelo menos um mês completo de movimentos para pedir dicas (o mês atual ainda não conta).',
    );
  }
  const tips = await savingsTips(aiProvider()!, aggregates);
  if (tips.length === 0) throw new HttpError(502, 'AI_INVALID_RESPONSE', 'A IA não devolveu dicas. Tenta outra vez.');
  const insight = await prisma.financeInsight.create({
    data: { userId: req.userId, tips: tips as object[], basedOn: aggregates as object },
  });
  res.status(201).json(insightView(insight));
});
