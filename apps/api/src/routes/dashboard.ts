import { Router } from 'express';
import { DEFAULT_TIMEZONE, startOfZonedDay, zonedDayKey } from '@studentos/shared';
import { gradeSummary } from '../lib/grades.js';
import { prisma } from '../lib/prisma.js';

export const dashboardRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const disciplineSelect = { select: { id: true, name: true, code: true, color: true } } as const;

// RF10 / HU04 — dados agregados do painel inicial
dashboardRouter.get('/', async (req, res) => {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * DAY);
  // Meia-noite de Lisboa (o servidor corre em UTC).
  const startOfToday = startOfZonedDay(zonedDayKey(now, DEFAULT_TIMEZONE), DEFAULT_TIMEZONE);

  const activeSemester = await prisma.semester.findFirst({
    where: { userId: req.userId, isActive: true },
  });

  const [upcomingTasks, overdueTasks, upcomingAssessments, disciplines] = await Promise.all([
    prisma.task.findMany({
      where: { userId: req.userId, status: 'TODO', dueDate: { gte: now, lte: in7Days } },
      include: { discipline: disciplineSelect },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
    }),
    prisma.task.findMany({
      where: { userId: req.userId, status: 'TODO', dueDate: { lt: now } },
      include: { discipline: disciplineSelect },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.assessment.findMany({
      where: { discipline: { userId: req.userId }, score: null, date: { gte: startOfToday } },
      include: { discipline: disciplineSelect },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    prisma.discipline.findMany({
      where: {
        userId: req.userId,
        archivedAt: null,
        ...(activeSemester ? { semesterId: activeSemester.id } : {}),
      },
      include: { assessments: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  res.json({
    activeSemester,
    upcomingTasks,
    overdueTasks,
    upcomingAssessments,
    disciplines: disciplines.map(({ assessments, ...d }) => ({
      ...d,
      grades: gradeSummary({ ...d, assessments }),
    })),
  });
});
