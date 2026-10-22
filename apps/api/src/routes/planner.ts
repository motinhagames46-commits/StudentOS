// Planeador de estudo (spec §11): pré-visualização → confirmação explícita; replaneamento só do futuro.
import { Router } from 'express';
import {
  DEFAULT_TIMEZONE,
  addDaysToKey,
  calendarQuerySchema,
  overlaps,
  planStudy,
  plannerPreviewSchema,
  priorityOf,
  explain,
  startOfZonedDay,
  studyPreferencesSchema,
  zonedDayKey,
  type PlanResult,
  type ProposedSession,
  type WorkItem,
} from '@studentos/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError, notFound, parse } from '../lib/http.js';
import { buildPlannerContext, getPreferences, isProtected } from '../lib/planner.js';
import { prisma } from '../lib/prisma.js';

export const plannerRouter = Router();
export const preferencesRouter = Router();

const DRAFT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_DAYS = 7;

const sessionInclude = {
  task: { select: { id: true, title: true, status: true } },
  assessment: { select: { id: true, name: true, date: true } },
  discipline: { select: { id: true, name: true, code: true, color: true } },
} as const;

interface StoredProposal extends PlanResult {
  removals: { id: number; startAt: string; endAt: string; reason: string }[];
  kind: 'plan' | 'replan';
}

// GET/PUT /api/preferences/study — preferências e disponibilidade semanal
preferencesRouter.get('/study', async (req, res) => {
  const { preferences, availability } = await getPreferences(req.userId);
  res.json({ ...pickPrefs(preferences), availability });
});

preferencesRouter.put('/study', async (req, res) => {
  const input = parse(studyPreferencesSchema, req.body);
  const { availability, ...prefs } = input;
  await prisma.$transaction([
    prisma.studyPreferences.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...prefs },
      update: prefs,
    }),
    prisma.availabilityRule.deleteMany({ where: { userId: req.userId } }),
    prisma.availabilityRule.createMany({ data: availability.map((w) => ({ ...w, userId: req.userId })) }),
  ]);
  const saved = await getPreferences(req.userId);
  res.json({ ...pickPrefs(saved.preferences), availability: saved.availability });
});

function pickPrefs(p: {
  sessionMinutes: number;
  minSessionMinutes: number;
  breakMinutes: number;
  maxDailyMinutes: number;
}) {
  return {
    sessionMinutes: p.sessionMinutes,
    minSessionMinutes: p.minSessionMinutes,
    breakMinutes: p.breakMinutes,
    maxDailyMinutes: p.maxDailyMinutes,
  };
}

async function createDraft(userId: number, fromKey: string | undefined, days: number, kind: 'plan' | 'replan') {
  const now = new Date();
  const todayKey = zonedDayKey(now, DEFAULT_TIMEZONE);
  const startKey = fromKey && fromKey > todayKey ? fromKey : todayKey;
  const from = new Date(Math.max(startOfZonedDay(startKey, DEFAULT_TIMEZONE).getTime(), now.getTime()));
  const to = startOfZonedDay(addDaysToKey(startKey, days), DEFAULT_TIMEZONE);

  const context = await buildPlannerContext(userId, from, to, now);
  const result = planStudy(context.input);
  const proposal: StoredProposal = {
    ...result,
    kind,
    removals: context.replaceable.map((r) => ({
      id: r.id,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      reason: r.reason,
    })),
  };

  const last = await prisma.studyPlan.findFirst({ where: { userId }, orderBy: { version: 'desc' } });
  const [, plan] = await prisma.$transaction([
    prisma.studyPlan.updateMany({ where: { userId, status: 'DRAFT' }, data: { status: 'DISCARDED' } }),
    prisma.studyPlan.create({
      data: {
        userId,
        version: (last?.version ?? 0) + 1,
        fromDate: from,
        toDate: to,
        proposal: proposal as unknown as Prisma.InputJsonValue,
        rules: result.rules as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
  return planView(plan);
}

function planView(plan: {
  id: string;
  version: number;
  status: string;
  fromDate: Date;
  toDate: Date;
  createdAt: Date;
  proposal: unknown;
}) {
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    fromDate: plan.fromDate,
    toDate: plan.toDate,
    createdAt: plan.createdAt,
    expiresAt: new Date(plan.createdAt.getTime() + DRAFT_TTL_MS),
    proposal: plan.proposal as StoredProposal,
  };
}

// POST /api/planner/preview — gera uma proposta sem alterar sessões existentes
plannerRouter.post('/preview', async (req, res) => {
  const { from, days } = parse(plannerPreviewSchema, req.body ?? {});
  res.status(201).json(await createDraft(req.userId, from, days ?? DEFAULT_DAYS, 'plan'));
});

// POST /api/planner/replan — nova proposta a partir de agora; protege concluídas, fixadas e a decorrer
plannerRouter.post('/replan', async (req, res) => {
  const { days } = parse(plannerPreviewSchema, req.body ?? {});
  res.status(201).json(await createDraft(req.userId, undefined, days ?? DEFAULT_DAYS, 'replan'));
});

async function findOwnedPlan(userId: number, id: string) {
  const plan = await prisma.studyPlan.findFirst({ where: { id, userId } });
  if (!plan) throw notFound('PLAN_NOT_FOUND', 'Plano não encontrado');
  return plan;
}

// POST /api/planner/:id/confirm — aplica a proposta depois de revalidar contra o estado atual
plannerRouter.post('/:id/confirm', async (req, res) => {
  const plan = await findOwnedPlan(req.userId, req.params.id);
  if (plan.status !== 'DRAFT') throw new HttpError(409, 'PLAN_NOT_DRAFT', 'Este plano já não é uma proposta pendente');
  const now = new Date();
  if (plan.createdAt.getTime() + DRAFT_TTL_MS < now.getTime()) {
    throw new HttpError(410, 'PLAN_EXPIRED', 'A proposta expirou. Gera um novo plano.');
  }

  const proposal = plan.proposal as unknown as StoredProposal;
  const context = await buildPlannerContext(req.userId, plan.fromDate, plan.toDate, now);
  const stale =
    proposal.sessions.some((s) => {
      const interval = { start: new Date(s.start), end: new Date(s.end) };
      return interval.start < now || context.busy.some((b) => overlaps(b, interval));
    }) || proposal.removals.some((r) => !context.replaceable.some((c) => c.id === r.id));
  if (stale) {
    throw new HttpError(409, 'PLAN_STALE', 'O calendário mudou desde a pré-visualização. Gera um novo plano.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const removed = await tx.plannedSession.updateMany({
      where: { userId: req.userId, id: { in: proposal.removals.map((r) => r.id) }, status: 'PLANNED', pinned: false },
      data: { status: 'CANCELLED' },
    });
    const created = await tx.plannedSession.createMany({
      data: proposal.sessions.map((s: ProposedSession) => ({
        userId: req.userId,
        startAt: new Date(s.start),
        endAt: new Date(s.end),
        plannedMinutes: s.minutes,
        reason: s.reason,
        taskId: s.type === 'task' ? s.itemId : null,
        assessmentId: s.type === 'assessment' ? s.itemId : null,
        disciplineId: s.disciplineId,
        planId: plan.id,
      })),
    });
    await tx.studyPlan.updateMany({
      where: { userId: req.userId, status: 'CONFIRMED' },
      data: { status: 'SUPERSEDED' },
    });
    await tx.studyPlan.update({ where: { id: plan.id }, data: { status: 'CONFIRMED', confirmedAt: now } });
    return { created: created.count, removed: removed.count };
  });
  res.json(result);
});

// DELETE /api/planner/:id — descarta uma proposta
plannerRouter.delete('/:id', async (req, res) => {
  const plan = await findOwnedPlan(req.userId, req.params.id);
  if (plan.status === 'DRAFT') {
    await prisma.studyPlan.update({ where: { id: plan.id }, data: { status: 'DISCARDED' } });
  }
  res.status(204).end();
});

// GET /api/planner/sessions?from=&to= — sessões planeadas (exceto canceladas) e proposta pendente
plannerRouter.get('/sessions', async (req, res) => {
  const { from, to } = parse(calendarQuerySchema, req.query);
  const [sessions, draft, prefs] = await Promise.all([
    prisma.plannedSession.findMany({
      where: {
        userId: req.userId,
        status: { not: 'CANCELLED' },
        startAt: { lt: new Date(to) },
        endAt: { gt: new Date(from) },
      },
      include: sessionInclude,
      orderBy: { startAt: 'asc' },
    }),
    prisma.studyPlan.findFirst({
      where: { userId: req.userId, status: 'DRAFT', createdAt: { gt: new Date(Date.now() - DRAFT_TTL_MS) } },
      orderBy: { createdAt: 'desc' },
    }),
    getPreferences(req.userId),
  ]);
  const now = new Date();
  res.json({
    sessions: sessions.map((s) => ({ ...s, protected: isProtected(s, now) })),
    draft: draft ? planView(draft) : null,
    hasAvailability: prefs.availability.length > 0,
  });
});

// GET /api/planner/suggestion — "O que devo estudar agora?" (spec §11.7)
// A explicação é sempre recalculada no momento do pedido: o texto guardado no plano fica desatualizado
// quando o estudante muda a tarefa ou o tempo passa.
plannerRouter.get('/suggestion', async (req, res) => {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60 * 1000);
  // Mesmo período que «Gerar plano», para a urgência e a quota pelos ECTS coincidirem com as do plano.
  const end = startOfZonedDay(addDaysToKey(zonedDayKey(now, DEFAULT_TIMEZONE), DEFAULT_DAYS), DEFAULT_TIMEZONE);
  const [current, { input }] = await Promise.all([
    prisma.plannedSession.findFirst({
      where: { userId: req.userId, status: 'PLANNED', startAt: { lt: soon }, endAt: { gt: now } },
      include: sessionInclude,
      orderBy: { startAt: 'asc' },
    }),
    buildPlannerContext(req.userId, now, end, now),
  ]);
  const describe = (item: WorkItem) => explain(item, priorityOf(item, now), now, DEFAULT_TIMEZONE);

  if (current) {
    const item = input.items.find(
      (i) =>
        (i.type === 'task' && i.id === current.taskId) || (i.type === 'assessment' && i.id === current.assessmentId),
    );
    res.json({ kind: 'session', session: current, message: item ? describe(item) : 'Sessão de estudo planeada.' });
    return;
  }

  // Itens sem duração estimada também contam: uma tarefa urgente não pode desaparecer só por não ter estimativa.
  const candidates = input.items.filter((i) => i.remainingMinutes === null || i.remainingMinutes > 0);
  if (candidates.length === 0) {
    res.json({
      kind: 'missing',
      message: input.items.length
        ? 'Esta semana já cumpriste o ritmo de estudo previsto. Bom trabalho!'
        : 'Não há trabalho pendente. Adiciona tarefas ou avaliações.',
    });
    return;
  }
  const ranked = candidates
    .map((item) => ({ item, p: priorityOf(item, now) }))
    .sort((a, b) => b.p.score - a.p.score || a.item.id - b.item.id);
  const top = ranked[0]!.item;
  const needsEstimate = top.remainingMinutes === null;
  res.json({
    kind: 'item',
    item: { type: top.type, id: top.id, title: top.title, disciplineId: top.disciplineId },
    needsEstimate,
    message:
      describe(top) +
      (needsEstimate ? ` ${top.missingInfo ?? 'Indica a duração estimada para o planeador lhe reservar tempo.'}` : ''),
  });
});
