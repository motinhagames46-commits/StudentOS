// Ponte entre a base de dados e o motor determinístico (packages/shared/src/planner.ts).
// Decide o que é ocupado, o que está protegido e o que pode ser substituído (spec §11.6, §11.8).
import {
  DEFAULT_PLANNER_PREFERENCES,
  DEFAULT_TIMEZONE,
  minutesByDay,
  type Interval,
  type PlannerInput,
  type PlannerPreferences,
  type WorkItem,
} from '@studentos/shared';
import type { PlannedSession } from '../generated/prisma/client.js';
import { blockOccurrences } from './calendar.js';
import { prisma } from './prisma.js';

const ASSESSMENT_LABELS: Record<string, string> = {
  TEST: 'Teste',
  EXAM: 'Exame',
  PROJECT: 'Projeto',
  ASSIGNMENT: 'Trabalho',
  PRESENTATION: 'Apresentação',
  OTHER: 'Avaliação',
};

export async function getPreferences(userId: number) {
  const preferences = await prisma.studyPreferences.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const availability = await prisma.availabilityRule.findMany({
    where: { userId },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    select: { weekday: true, startMinute: true, endMinute: true },
  });
  return { preferences, availability };
}

/** Sessões que o replaneamento nunca altera: concluídas, fixadas ou a decorrer (spec §11.3). */
export function isProtected(s: Pick<PlannedSession, 'status' | 'pinned' | 'startAt' | 'endAt'>, now: Date): boolean {
  if (s.status === 'COMPLETED') return true;
  if (s.status !== 'PLANNED') return false;
  return s.pinned || (s.startAt <= now && s.endAt > now);
}

/** Sessões que uma nova proposta pode substituir: planeadas, não fixadas e ainda por começar. */
export function isReplaceable(s: Pick<PlannedSession, 'status' | 'pinned' | 'startAt'>, now: Date): boolean {
  return s.status === 'PLANNED' && !s.pinned && s.startAt > now;
}

export interface PlannerContext {
  input: PlannerInput;
  replaceable: { id: number; startAt: Date; endAt: Date; reason: string }[];
  /** Intervalos ocupados atuais (aulas/eventos + sessões protegidas), para revalidar na confirmação. */
  busy: Interval[];
}

export async function buildPlannerContext(userId: number, from: Date, to: Date, now: Date): Promise<PlannerContext> {
  const { preferences, availability } = await getPreferences(userId);
  const prefs: PlannerPreferences = {
    sessionMinutes: preferences.sessionMinutes ?? DEFAULT_PLANNER_PREFERENCES.sessionMinutes,
    minSessionMinutes: preferences.minSessionMinutes,
    breakMinutes: preferences.breakMinutes,
    maxDailyMinutes: preferences.maxDailyMinutes,
  };

  const [blocks, sessions, tasks, assessments] = await Promise.all([
    blockOccurrences(userId, from, to),
    prisma.plannedSession.findMany({ where: { userId, status: { not: 'CANCELLED' } } }),
    prisma.task.findMany({
      // Disciplinas arquivadas saem do plano; tarefas sem disciplina continuam.
      where: { userId, status: 'TODO', OR: [{ disciplineId: null }, { discipline: { archivedAt: null } }] },
      include: { discipline: { select: { id: true, code: true } } },
    }),
    prisma.assessment.findMany({
      where: { discipline: { userId, archivedAt: null }, score: null, OR: [{ date: null }, { date: { gt: now } }] },
      include: { discipline: { select: { id: true, code: true } } },
    }),
  ]);

  const protectedSessions = sessions.filter((s) => isProtected(s, now));
  const inRange = (s: { startAt: Date; endAt: Date }) => s.startAt < to && s.endAt > from;
  const busy: Interval[] = [
    ...blocks.filter((b) => b.isBusy).map((b) => ({ start: b.start, end: b.end })),
    ...protectedSessions.filter(inRange).map((s) => ({ start: s.startAt, end: s.endAt })),
  ];

  // Trabalho já feito ou já reservado por sessões protegidas, por item.
  const doneMinutes = new Map<string, number>();
  const missed = new Map<string, number>();
  for (const s of sessions) {
    const key = s.taskId ? `task:${s.taskId}` : s.assessmentId ? `assessment:${s.assessmentId}` : null;
    if (!key) continue;
    if (s.status === 'MISSED') missed.set(key, (missed.get(key) ?? 0) + 1);
    if (isProtected(s, now)) {
      const minutes = s.status === 'COMPLETED' ? (s.actualMinutes ?? s.plannedMinutes) : s.plannedMinutes;
      doneMinutes.set(key, (doneMinutes.get(key) ?? 0) + minutes);
    }
  }
  const remaining = (key: string, estimate: number | null) =>
    estimate === null ? null : Math.max(0, estimate - (doneMinutes.get(key) ?? 0));

  const items: WorkItem[] = [
    ...tasks.map((t): WorkItem => ({
      type: 'task',
      id: t.id,
      title: t.title,
      disciplineId: t.disciplineId,
      disciplineCode: t.discipline?.code ?? null,
      deadline: t.dueDate,
      remainingMinutes: remaining(`task:${t.id}`, t.estimatedMinutes),
      priority: t.priority,
      weightPercent: null,
      missedCount: missed.get(`task:${t.id}`) ?? 0,
      label: 'Tarefa',
    })),
    ...assessments
      // Só entram no plano avaliações com tempo de preparação indicado ou com data marcada.
      .filter((a) => a.prepMinutes !== null || a.date !== null)
      .map((a): WorkItem => ({
        type: 'assessment',
        id: a.id,
        title: a.name,
        disciplineId: a.disciplineId,
        disciplineCode: a.discipline.code,
        deadline: a.date,
        remainingMinutes: remaining(`assessment:${a.id}`, a.prepMinutes),
        priority: a.weight >= 30 ? 'HIGH' : a.weight >= 15 ? 'MEDIUM' : 'LOW',
        weightPercent: a.weight,
        missedCount: missed.get(`assessment:${a.id}`) ?? 0,
        label: ASSESSMENT_LABELS[a.type] ?? 'Avaliação',
      })),
  ];

  const protectedIntervals = protectedSessions.filter(inRange).map((s) => ({ start: s.startAt, end: s.endAt }));
  return {
    input: {
      now,
      from,
      to,
      timeZone: DEFAULT_TIMEZONE,
      availability,
      busy,
      protectedMinutesByDay: minutesByDay(protectedIntervals, DEFAULT_TIMEZONE),
      items,
      preferences: prefs,
    },
    replaceable: sessions
      .filter((s) => isReplaceable(s, now) && s.startAt < to && s.endAt > from)
      .map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt, reason: s.reason })),
    busy,
  };
}
