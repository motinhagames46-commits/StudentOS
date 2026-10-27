import { DEFAULT_TIMEZONE, zonedDayKey } from '@studentos/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAiProviderForTests } from '../src/ai/access.js';
import { aggregateFinances, shiftMonth } from '../src/ai/finance.js';
import { app } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { FakeAiProvider } from './fake-ai.js';
import { createUserAndLogin, resetDb } from './helpers.js';

let owner: string[];
let other: string[];
let fake: FakeAiProvider;

const thisMonth = () => zonedDayKey(new Date(), DEFAULT_TIMEZONE).slice(0, 7);
const add = (body: Record<string, unknown>, cookie = owner) =>
  request(app).post('/api/finances/transactions').set('Cookie', cookie).send(body);

beforeEach(async () => {
  await resetDb();
  ({ cookie: owner } = await createUserAndLogin('dono'));
  ({ cookie: other } = await createUserAndLogin('colega'));
  env.AI_ALLOWED_EMAILS = ['dono@exemplo.pt'];
  fake = new FakeAiProvider([]);
  setAiProviderForTests(fake);
  await request(app).post('/api/ai/consent').set('Cookie', owner);
});

afterEach(() => {
  env.AI_ALLOWED_EMAILS = [];
  setAiProviderForTests(undefined);
});

describe('movimentos e resumo', () => {
  it('cria a categoria à primeira vez, reutiliza-a depois e resume o mês e os 6 meses', async () => {
    const month = thisMonth();
    const res = await add({ kind: 'EXPENSE', amountCents: 1250, occurredOn: `${month}-02`, category: 'Cantina' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amountCents: 1250, category: 'Cantina', occurredOn: `${month}-02` });
    await add({ kind: 'EXPENSE', amountCents: 750, occurredOn: `${month}-03`, category: 'Cantina' });
    await add({ kind: 'INCOME', amountCents: 30000, occurredOn: `${month}-01`, category: 'Bolsa' });
    await add({ kind: 'EXPENSE', amountCents: 999, occurredOn: `${shiftMonth(month, -1)}-15` });
    expect(await prisma.financeCategory.count()).toBe(2);

    const { body: list } = await request(app).get(`/api/finances/transactions?month=${month}`).set('Cookie', owner);
    expect(list).toHaveLength(3);
    const { body: summary } = await request(app).get(`/api/finances/summary?month=${month}`).set('Cookie', owner);
    expect(summary).toMatchObject({ month, incomeCents: 30000, expenseCents: 2000 });
    expect(summary.byCategory[0]).toEqual({ kind: 'INCOME', category: 'Bolsa', cents: 30000 });
    expect(summary.byCategory).toContainEqual({ kind: 'EXPENSE', category: 'Cantina', cents: 2000 });
    expect(summary.months).toHaveLength(6);
    expect(summary.months[4]).toEqual({ month: shiftMonth(month, -1), incomeCents: 0, expenseCents: 999 });
  });

  it('valida valores e meses; movimentos de outra conta não aparecem nem se apagam', async () => {
    expect((await add({ kind: 'EXPENSE', amountCents: 0, occurredOn: '2026-10-01' })).status).toBe(400);
    expect((await add({ kind: 'EXPENSE', amountCents: 12.5, occurredOn: '2026-10-01' })).status).toBe(400);
    expect((await request(app).get('/api/finances/summary?month=2026-13').set('Cookie', owner)).status).toBe(400);
    expect((await request(app).get('/api/finances/summary?month=0050-03').set('Cookie', owner)).status).toBe(400);
    expect((await add({ kind: 'EXPENSE', amountCents: 100, occurredOn: '0000-01-01' })).status).toBe(400);
    const multi = await add({
      kind: 'EXPENSE',
      amountCents: 100,
      occurredOn: '2026-10-01',
      category: 'Linha 1\nLinha 2',
    });
    expect(multi.body.category).toBe('Linha 1 Linha 2');

    const { body: mine } = await add({ kind: 'EXPENSE', amountCents: 500, occurredOn: `${thisMonth()}-01` });
    expect((await request(app).get('/api/finances/transactions').set('Cookie', other)).body).toEqual([]);
    expect((await request(app).delete(`/api/finances/transactions/${mine.id}`).set('Cookie', other)).status).toBe(404);
    expect((await request(app).delete(`/api/finances/transactions/${mine.id}`).set('Cookie', owner)).status).toBe(204);
  });
});

describe('objetivos de poupança', () => {
  it('cria, junta dinheiro no servidor e apaga; de outra conta dá 404', async () => {
    const { body: goal } = await request(app)
      .post('/api/finances/goals')
      .set('Cookie', owner)
      .send({ name: 'Portátil', targetCents: 80000, deadline: '2027-06-30' });
    expect(goal).toMatchObject({ name: 'Portátil', savedCents: 0, deadline: '2027-06-30' });
    const add = (cookie: string[], amountCents: number) =>
      request(app).post(`/api/finances/goals/${goal.id}/add`).set('Cookie', cookie).send({ amountCents });
    expect((await add(owner, 25000)).body.savedCents).toBe(25000);
    // Dois «Juntar» seguidos somam os dois (o servidor soma; nenhum se perde).
    await Promise.all([add(owner, 1000), add(owner, 2000)]);
    expect((await prisma.savingsGoal.findUniqueOrThrow({ where: { id: goal.id } })).savedCents).toBe(28000);
    expect((await add(owner, 10_000_000)).status).toBe(400); // passaria do máximo
    expect((await add(other, 100)).status).toBe(404);
    expect((await request(app).delete(`/api/finances/goals/${goal.id}`).set('Cookie', other)).status).toBe(404);
    expect((await request(app).delete(`/api/finances/goals/${goal.id}`).set('Cookie', owner)).status).toBe(204);
  });
});

describe('dicas de poupança (IA)', () => {
  const tips = { tips: [{ title: 'Orçamento para a cantina', body: 'Gastas em média 20,00 € por mês na cantina.' }] };

  it('só com a IA ativa; sem um mês completo de movimentos dá 422', async () => {
    expect((await request(app).post('/api/finances/insights').set('Cookie', other)).status).toBe(403);
    await add({ kind: 'EXPENSE', amountCents: 500, occurredOn: `${thisMonth()}-01` });
    const res = await request(app).post('/api/finances/insights').set('Cookie', owner);
    expect(res.status).toBe(422);
    expect(fake.requests).toHaveLength(0);
  });

  it('envia só médias agregadas: nem notas, nem datas, nem nomes de objetivos', async () => {
    const last = shiftMonth(thisMonth(), -1);
    await add({
      kind: 'EXPENSE',
      amountCents: 2000,
      occurredOn: `${last}-17`,
      category: 'Cantina',
      note: 'jantar com a Rita',
    });
    await add({ kind: 'INCOME', amountCents: 30000, occurredOn: `${last}-01`, category: 'Bolsa' });
    await request(app)
      .post('/api/finances/goals')
      .set('Cookie', owner)
      .send({ name: 'Viagem a Paris', targetCents: 50000, savedCents: 10000 });

    fake = new FakeAiProvider([tips]);
    setAiProviderForTests(fake);
    const res = await request(app).post('/api/finances/insights').set('Cookie', owner);
    expect(res.status).toBe(201);
    expect(res.body.tips).toEqual(tips.tips);
    expect(res.body.basedOn).toMatchObject({ months: 1, avgExpenseCents: 2000, savingsRatePercent: 93 });

    const sent = JSON.stringify(fake.requests[0]);
    expect(sent).toContain('Cantina: 20,00 €');
    for (const secret of ['Rita', 'Paris', `${last}-17`, `${last}-01`]) expect(sent).not.toContain(secret);

    const latest = await request(app).get('/api/finances/insights/latest').set('Cookie', owner);
    expect(latest.body.id).toBe(res.body.id);
    expect((await request(app).get('/api/finances/insights/latest').set('Cookie', other)).body).toBeNull();
  });
});

it('aggregateFinances: médias dos 3 meses completos anteriores, só os meses com movimentos', () => {
  const t = (kind: 'EXPENSE' | 'INCOME', amountCents: number, occurredOn: string, category: string | null = null) => ({
    kind,
    amountCents,
    occurredOn,
    category,
  });
  const a = aggregateFinances(
    [
      t('EXPENSE', 3000, '2026-10-05', 'Renda'), // mês atual: não conta
      t('EXPENSE', 2000, '2026-09-05', 'Cantina'),
      t('EXPENSE', 4000, '2026-07-05', 'Cantina'),
      t('EXPENSE', 1000, '2026-07-06'),
      t('INCOME', 10000, '2026-09-01'),
      t('EXPENSE', 9999, '2026-06-30', 'Antigo'), // fora da janela
    ],
    [{ targetCents: 1000, savedCents: 100, deadline: '2027-01-31' }],
    '2026-10',
  );
  expect(a).toEqual({
    months: 2,
    avgIncomeCents: 5000,
    avgExpenseCents: 3500,
    expenseByCategory: [
      { category: 'Cantina', avgCents: 3000 },
      { category: 'Sem categoria', avgCents: 500 },
    ],
    savingsRatePercent: 30,
    goals: [{ targetCents: 1000, savedCents: 100, monthsLeft: 3 }],
  });
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
});
