import { Router } from 'express';
import { addDaysToKey, calendarQuerySchema, statsQuerySchema } from '@studentos/shared';
import { blockOccurrences } from '../lib/calendar.js';
import { parse } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

export const insightsRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const TZ = 'Europe/Lisbon';
const disciplineSelect = { select: { id: true, name: true, code: true, color: true } } as const;

/** Chave aaaa-mm-dd do dia civil em Lisboa (RNF10). */
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Instante (UTC) da meia-noite de Lisboa no dia `key`, independente do fuso do servidor. */
function startOfLisbonDay(key: string): Date {
  const utcMidnight = new Date(`${key}T00:00:00Z`);
  const asLisbon = new Date(utcMidnight.toLocaleString('en-US', { timeZone: TZ }));
  const asUtc = new Date(utcMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utcMidnight.getTime() - (asLisbon.getTime() - asUtc.getTime()));
}

// RF14 — tempo de estudo por disciplina e por dia, e progresso das tarefas.
// O intervalo são `days` dias civis completos: hoje e os (days − 1) anteriores.
insightsRouter.get('/stats', async (req, res) => {
  const { days = 7 } = parse(statsQuerySchema, req.query);
  const now = new Date();
  // Dias civis, não blocos de 24 h: na semana a seguir à mudança da hora, 24 h antes pode ser o mesmo dia.
  const keys = Array.from({ length: days }, (_, i) => addDaysToKey(dayKey.format(now), i - (days - 1)));
  const from = startOfLisbonDay(keys[0]!);

  const [sessions, taskCounts, completedInRange, overdue] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId: req.userId, startedAt: { lte: now }, OR: [{ endedAt: null }, { endedAt: { gte: from } }] },
      include: { discipline: disciplineSelect },
    }),
    prisma.task.groupBy({ by: ['status'], where: { userId: req.userId }, _count: { _all: true } }),
    prisma.task.count({ where: { userId: req.userId, status: 'DONE', completedAt: { gte: from } } }),
    prisma.task.count({ where: { userId: req.userId, status: 'TODO', dueDate: { lt: now } } }),
  ]);

  // Cada sessão conta só a parte dentro do intervalo; uma sessão em curso conta até agora.
  // O tempo é atribuído ao dia em que a sessão começou.
  const byDiscipline = new Map<number | null, { discipline: (typeof sessions)[number]['discipline']; ms: number }>();
  const byDay = new Map<string, number>();
  for (const key of keys) byDay.set(key, 0);

  for (const s of sessions) {
    const start = Math.max(s.startedAt.getTime(), from.getTime());
    const end = Math.min((s.endedAt ?? now).getTime(), now.getTime());
    // Só conta o tempo de foco: as pausas são descontadas proporcionalmente à parte dentro do intervalo.
    const fullMs = Math.max(1, (s.endedAt ?? now).getTime() - s.startedAt.getTime());
    const pausedMs = s.pausedSeconds * 1000 + (s.pausedAt && !s.endedAt ? now.getTime() - s.pausedAt.getTime() : 0);
    const focusShare = Math.max(0, 1 - pausedMs / fullMs);
    const ms = Math.max(0, end - start) * focusShare;
    if (ms === 0) continue;

    const entry = byDiscipline.get(s.disciplineId) ?? { discipline: s.discipline, ms: 0 };
    entry.ms += ms;
    byDiscipline.set(s.disciplineId, entry);

    const key = dayKey.format(new Date(start));
    if (byDay.has(key)) byDay.set(key, byDay.get(key)! + ms);
  }

  const toMinutes = (ms: number) => Math.round(ms / 60000);
  const count = (status: 'TODO' | 'DONE') => taskCounts.find((t) => t.status === status)?._count._all ?? 0;

  res.json({
    range: { from: from.toISOString(), to: now.toISOString(), days },
    studyByDiscipline: [...byDiscipline.values()]
      .map((e) => ({ discipline: e.discipline, minutes: toMinutes(e.ms) }))
      .filter((e) => e.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes),
    studyByDay: [...byDay.entries()].map(([date, ms]) => ({ date, minutes: toMinutes(ms) })),
    totalMinutes: toMinutes([...byDiscipline.values()].reduce((s, e) => s + e.ms, 0)),
    tasks: { todo: count('TODO'), done: count('DONE'), overdue, completedInRange },
  });
});

// RF15 — prazos de tarefas e datas de avaliações num intervalo.
insightsRouter.get('/calendar', async (req, res) => {
  const { from, to } = parse(calendarQuerySchema, req.query);
  const [tasks, assessments, blocks] = await Promise.all([
    prisma.task.findMany({
      where: { userId: req.userId, dueDate: { gte: from, lte: to } },
      include: { discipline: disciplineSelect },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.assessment.findMany({
      where: { discipline: { userId: req.userId }, date: { gte: from, lte: to } },
      include: { discipline: disciplineSelect },
      orderBy: { date: 'asc' },
    }),
    blockOccurrences(req.userId, new Date(from), new Date(to)),
  ]);
  res.json({ tasks, assessments, blocks });
});

// RF17 — alertas na aplicação: tarefas por fazer e avaliações sem nota nas próximas 48 h.
insightsRouter.get('/alerts', async (req, res) => {
  const now = new Date();
  const in48h = new Date(now.getTime() + 2 * DAY);
  const [tasks, assessments, overdue] = await Promise.all([
    prisma.task.findMany({
      where: { userId: req.userId, status: 'TODO', dueDate: { gte: now, lte: in48h } },
      include: { discipline: disciplineSelect },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.assessment.findMany({
      where: { discipline: { userId: req.userId }, score: null, date: { gte: now, lte: in48h } },
      include: { discipline: disciplineSelect },
      orderBy: { date: 'asc' },
    }),
    prisma.task.count({ where: { userId: req.userId, status: 'TODO', dueDate: { lt: now } } }),
  ]);
  res.json({ tasks, assessments, overdue, count: tasks.length + assessments.length });
});
