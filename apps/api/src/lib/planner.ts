// Ponte entre a base de dados e o motor determinístico (packages/shared/src/planner.ts).
// Decide o que é ocupado, o que está protegido e o que pode ser substituído (spec §11.6, §11.8).
import {
  DEFAULT_PLANNER_PREFERENCES,
  DEFAULT_TIMEZONE,
  addDaysToKey,
  ectsPace,
  ectsPaceNote,
  minutesByDay,
  startOfZonedDay,
  zonedDayKey,
  type EctsPaceMissing,
  type Interval,
  type PlannerInput,
  type PlannerPreferences,
  type WorkItem,
} from '@studentos/shared';
import type { PlannedSession } from '../generated/prisma/client.js';
import { blockOccurrences } from './calendar.js';
import { prisma } from './prisma.js';

/** shortcut: estimativa fixa por pergunta; passa a média real dos CardReview quando houver histórico. */
const REVIEW_MINUTES_PER_CARD = 1.5;

/** Minutos para as revisões devidas, em blocos de 5 (a grelha do planeador). */
export const reviewMinutes = (cards: number) => Math.ceil((cards * REVIEW_MINUTES_PER_CARD) / 5) * 5;

const ASSESSMENT_LABELS: Record<string, string> = {
  TEST: 'Teste',
  EXAM: 'Exame',
  PROJECT: 'Projeto',
  ASSIGNMENT: 'Trabalho',
  PRESENTATION: 'Apresentação',
  OTHER: 'Avaliação',
};

export async function getPreferences(userId: number) {
  // Criação idempotente (ON CONFLICT DO NOTHING): o painel pede sessões e sugestão em simultâneo e o
  // upsert do Prisma colidia na conta nova (409 num dos pedidos).
  await prisma.studyPreferences.createMany({ data: [{ userId }], skipDuplicates: true });
  const preferences = await prisma.studyPreferences.findUniqueOrThrow({ where: { userId } });
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

  const todayKey = zonedDayKey(now, DEFAULT_TIMEZONE);
  const endOfToday = startOfZonedDay(addDaysToKey(todayKey, 1), DEFAULT_TIMEZONE);
  const [blocks, sessions, tasks, assessments, dueCards] = await Promise.all([
    blockOccurrences(userId, from, to),
    prisma.plannedSession.findMany({ where: { userId, status: { not: 'CANCELLED' } } }),
    prisma.task.findMany({
      // Disciplinas arquivadas saem do plano; tarefas sem disciplina continuam.
      where: { userId, status: 'TODO', OR: [{ disciplineId: null }, { discipline: { archivedAt: null } }] },
      include: { discipline: { select: { id: true, code: true } } },
    }),
    prisma.assessment.findMany({
      where: { discipline: { userId, archivedAt: null }, score: null, OR: [{ date: null }, { date: { gt: now } }] },
      include: { discipline: { select: { id: true, code: true, ects: true, semesterId: true } } },
    }),
    prisma.studyCard.count({ where: { userId, due: { lt: endOfToday } } }),
  ]);

  const protectedSessions = sessions.filter((s) => isProtected(s, now));
  const inRange = (s: { startAt: Date; endAt: Date }) => s.startAt < to && s.endAt > from;
  const busy: Interval[] = [
    ...blocks.filter((b) => b.isBusy).map((b) => ({ start: b.start, end: b.end })),
    ...protectedSessions.filter(inRange).map((s) => ({ start: s.startAt, end: s.endAt })),
  ];

  // Trabalho já feito ou já reservado por sessões protegidas, por item (no total e dentro do período).
  const doneMinutes = new Map<string, number>();
  const doneInRange = new Map<string, number>();
  const missed = new Map<string, number>();
  for (const s of sessions) {
    const key = s.taskId ? `task:${s.taskId}` : s.assessmentId ? `assessment:${s.assessmentId}` : null;
    if (!key) continue;
    if (s.status === 'MISSED') missed.set(key, (missed.get(key) ?? 0) + 1);
    if (isProtected(s, now)) {
      const minutes = s.status === 'COMPLETED' ? (s.actualMinutes ?? s.plannedMinutes) : s.plannedMinutes;
      doneMinutes.set(key, (doneMinutes.get(key) ?? 0) + minutes);
      if (inRange(s)) doneInRange.set(key, (doneInRange.get(key) ?? 0) + minutes);
    }
  }
  const pace = await ectsPaceContext(
    userId,
    assessments.filter((a) => a.prepMinutes === null && a.type !== 'OTHER').map((a) => a.discipline),
  );
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
    ...assessments.map((a): WorkItem => {
      const key = `assessment:${a.id}`;
      const item: WorkItem = {
        type: 'assessment',
        id: a.id,
        title: a.name,
        disciplineId: a.disciplineId,
        disciplineCode: a.discipline.code,
        deadline: a.date,
        remainingMinutes: remaining(key, a.prepMinutes),
        priority: a.weight >= 30 ? 'HIGH' : a.weight >= 15 ? 'MEDIUM' : 'LOW',
        weightPercent: a.weight,
        missedCount: missed.get(key) ?? 0,
        label: ASSESSMENT_LABELS[a.type] ?? 'Avaliação',
      };
      // Tempo de estudo indicado pelo estudante: usa-se tal como está.
      if (a.prepMinutes !== null) return item;
      // Participação, assiduidade… não pedem sessões de estudo, salvo indicação do estudante.
      if (a.type === 'OTHER') {
        return {
          ...item,
          missingInfo: `Indica o tempo de estudo de «${a.name}» (${a.discipline.code}) se precisar de preparação.`,
        };
      }
      // Sem tempo indicado: quota deste período pelo ritmo dos ECTS (spec §11.2, valor predefinido documentado).
      const semester = pace.semesterOf(a.discipline);
      const contact = pace.contactOf(a.discipline, semester);
      const result = ectsPace({
        ects: a.discipline.ects,
        contactMinutes: contact.minutes,
        weightPercent: a.weight,
        semester,
        assessmentDate: a.date,
        window: { from, to },
        now,
        doneTotalMinutes: doneMinutes.get(key) ?? 0,
        doneInWindowMinutes: doneInRange.get(key) ?? 0,
      });
      if (!result.ok) return { ...item, missingInfo: missingMessage(result.missing, a.name, a.discipline.code) };
      return {
        ...item,
        remainingMinutes: result.quotaMinutes,
        estimateSource: 'ects',
        estimateNote: ectsPaceNote(
          {
            ects: a.discipline.ects,
            contactMinutes: contact.minutes,
            weightPercent: a.weight,
            contactEstimated: contact.estimated,
          },
          result,
          DEFAULT_TIMEZONE,
        ),
      };
    }),
  ];

  // Revisões devidas até ao fim de hoje: um item com prazo hoje, só quando o período inclui hoje.
  // O que já foi revisto já não está devido; desconta-se só o tempo reservado em blocos de revisão fixados ou a
  // decorrer. Um teto diário evita que um atraso grande de revisões ocupe o dia todo.
  if (dueCards > 0 && from < endOfToday) {
    const reserved = protectedSessions
      .filter((s) => s.isReview && s.status === 'PLANNED' && zonedDayKey(s.startAt, DEFAULT_TIMEZONE) === todayKey)
      .reduce((sum, s) => sum + s.plannedMinutes, 0);
    const cap = Math.max(5, Math.floor(prefs.maxDailyMinutes / 4 / 5) * 5);
    items.push({
      type: 'review',
      id: 0,
      title: `Revisões (${dueCards} ${dueCards === 1 ? 'pergunta' : 'perguntas'})`,
      disciplineId: null,
      disciplineCode: null,
      // 23:59 de hoje, como um prazo sem hora (à meia-noite já seria «amanhã» na explicação).
      deadline: new Date(endOfToday.getTime() - 60_000),
      remainingMinutes: Math.max(0, Math.min(reviewMinutes(dueCards), cap) - reserved),
      priority: 'MEDIUM',
      weightPercent: null,
      missedCount: 0,
      label: 'Repetição espaçada',
    });
  }

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

function missingMessage(missing: EctsPaceMissing, name: string, code: string): string {
  switch (missing) {
    case 'ECTS':
      return `Falta o ECTS de ${code} — indica-o na disciplina, ou indica o tempo de estudo de «${name}».`;
    case 'SEMESTER':
      return `A disciplina ${code} não tem semestre com datas: escolhe o semestre, ou indica o tempo de estudo de «${name}».`;
    case 'SEMESTER_OVER':
      return `O semestre de ${code} já terminou: indica a data ou o tempo de estudo de «${name}».`;
  }
}

type SemesterDates = { start: Date; end: Date };

/**
 * Dados para o ritmo pelos ECTS: o semestre de cada disciplina (o ativo, se não tiver) e os minutos de aula
 * de cada disciplina nesse semestre. Aulas sem disciplina associada (a importação nem sempre as liga)
 * repartem-se pela fração de ECTS de cada disciplina do semestre — e a explicação assinala-o com «~».
 */
async function ectsPaceContext(userId: number, needed: { id: number; semesterId: number | null }[]) {
  const [semesters, disciplines] = needed.length
    ? await Promise.all([
        prisma.semester.findMany({ where: { userId } }),
        prisma.discipline.findMany({
          where: { userId, archivedAt: null },
          select: { id: true, ects: true, semesterId: true },
        }),
      ])
    : [[], []];
  const active = semesters.find((s) => s.isActive) ?? null;
  const byId = new Map(semesters.map((s) => [s.id, s]));
  const semesterRow = (d: { semesterId: number | null }) => (d.semesterId ? byId.get(d.semesterId) : active) ?? null;
  const semesterOf = (d: { semesterId: number | null }): SemesterDates | null => {
    const s = semesterRow(d);
    return s ? { start: s.startDate, end: s.endDate } : null;
  };

  // Minutos de aula por disciplina, por semestre (calculado uma vez por semestre).
  const contact = new Map<number, { linked: Map<number, number>; unlinked: number; ectsTotal: number }>();
  for (const s of new Set(needed.map((d) => semesterRow(d)).filter((s) => s !== null))) {
    const occurrences = await blockOccurrences(
      userId,
      s.startDate,
      new Date(s.endDate.getTime() + 24 * 60 * 60 * 1000),
    );
    const linked = new Map<number, number>();
    let unlinked = 0;
    for (const o of occurrences) {
      if (o.kind !== 'CLASS' || !o.isBusy || o.allDay) continue;
      const minutes = (o.end.getTime() - o.start.getTime()) / 60_000;
      if (o.discipline) linked.set(o.discipline.id, (linked.get(o.discipline.id) ?? 0) + minutes);
      else unlinked += minutes;
    }
    const ectsTotal = disciplines.filter((d) => semesterRow(d)?.id === s.id).reduce((sum, d) => sum + (d.ects ?? 0), 0);
    contact.set(s.id, { linked, unlinked, ectsTotal });
  }
  const contactOf = (
    d: { id: number; ects?: number | null; semesterId: number | null },
    semester: SemesterDates | null,
  ) => {
    const row = semesterRow(d);
    const c = row && semester ? contact.get(row.id) : undefined;
    if (!c) return { minutes: 0, estimated: false };
    const share = c.unlinked > 0 && c.ectsTotal > 0 && d.ects ? (c.unlinked * d.ects) / c.ectsTotal : 0;
    return { minutes: Math.round((c.linked.get(d.id) ?? 0) + share), estimated: share > 0 };
  };
  return { semesterOf, contactOf };
}
