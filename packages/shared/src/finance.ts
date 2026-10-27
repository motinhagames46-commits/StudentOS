// Finanças pessoais do estudante: movimentos em cêntimos inteiros (EUR), objetivos de poupança e dicas de
// poupança da IA calculadas só a partir de médias agregadas (sem notas, datas exatas nem nomes de objetivos).
import { z } from 'zod';

export const financeKinds = ['EXPENSE', 'INCOME'] as const;
export type FinanceKind = (typeof financeKinds)[number];

/** 100 000 €: chega para um estudante e trava enganos de vírgula. */
export const MAX_CENTS = 10_000_000;

const cents = z
  .number('Indica o valor')
  .int('Indica o valor em cêntimos')
  .positive('O valor tem de ser maior que 0')
  .max(MAX_CENTS, 'O valor é demasiado alto');
// Anos 1900–2099: o PostgreSQL não tem ano 0 e um ano com dois dígitos é quase sempre engano.
const dateOnly = z.iso.date('Data inválida').refine((d) => /^(19|20)\d{2}-/.test(d), 'Data inválida');

export const transactionCreateSchema = z.strictObject({
  kind: z.enum(financeKinds),
  amountCents: cents,
  occurredOn: dateOnly,
  /**
   * Nome da categoria, criada se ainda não existir. Uma etiqueta numa linha: vai para a IA nas dicas, por isso
   * nada de texto com várias linhas.
   */
  category: z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(40, 'Máximo 40 caracteres'))
    .nullable()
    .optional(),
  note: z.string().trim().max(200, 'Máximo 200 caracteres').nullable().optional(),
});

export const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, 'Mês inválido (aaaa-mm)')
    .optional(),
});

export const goalCreateSchema = z.strictObject({
  name: z.string('Indica o nome').trim().min(1, 'Indica o nome').max(60),
  targetCents: cents,
  savedCents: z.number().int().min(0, 'Não pode ser negativo').max(MAX_CENTS).optional(),
  deadline: dateOnly.nullable().optional(),
});
/** Juntar dinheiro a um objetivo: o servidor soma (dois separadores não se sobrepõem). */
export const goalAddSchema = z.strictObject({ amountCents: cents });

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type GoalCreateInput = z.infer<typeof goalCreateSchema>;

export interface FinanceTransactionView {
  id: number;
  kind: FinanceKind;
  amountCents: number;
  /** aaaa-mm-dd */
  occurredOn: string;
  note: string | null;
  category: string | null;
}

export interface FinanceSummary {
  month: string;
  incomeCents: number;
  expenseCents: number;
  byCategory: { kind: FinanceKind; category: string | null; cents: number }[];
  /** Os 6 meses até ao escolhido, do mais antigo para o mais recente. */
  months: { month: string; incomeCents: number; expenseCents: number }[];
}

export interface SavingsGoalView {
  id: number;
  name: string;
  targetCents: number;
  savedCents: number;
  deadline: string | null;
}

/** O que segue para a IA, tal como é mostrado ao estudante. */
export interface FinanceAggregates {
  /** Meses completos com movimentos usados nas médias (até 3). */
  months: number;
  avgIncomeCents: number;
  avgExpenseCents: number;
  expenseByCategory: { category: string; avgCents: number }[];
  savingsRatePercent: number | null;
  goals: { targetCents: number; savedCents: number; monthsLeft: number | null }[];
}

export interface FinanceTip {
  title: string;
  body: string;
}

export interface FinanceInsightView {
  id: number;
  createdAt: string;
  tips: FinanceTip[];
  basedOn: FinanceAggregates;
}
