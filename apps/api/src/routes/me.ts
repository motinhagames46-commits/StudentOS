import { Router } from 'express';
import {
  DEFAULT_TIMEZONE,
  changePasswordSchema,
  deleteAccountSchema,
  idParamSchema,
  startOfZonedDay,
  zonedDayKey,
} from '@studentos/shared';
import { clearSessionCookie, hashPassword, isCommonPassword, verifyPassword } from '../lib/auth.js';
import { HttpError, notFound, parse, validationError } from '../lib/http.js';
import { buildCalendar, type ExportEvent } from '../lib/ics-export.js';
import { prisma } from '../lib/prisma.js';
import { startSession } from '../lib/sessions.js';

export const meRouter = Router();

export function publicUser(user: { id: number; name: string; email: string; createdAt: Date }) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export async function meResponse(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const activeSemester = await prisma.semester.findFirst({ where: { userId, isActive: true } });
  return { user: publicUser(user), activeSemester };
}

meRouter.get('/', async (req, res) => {
  res.json(await meResponse(req.userId));
});

// Sessões ativas da conta (dispositivos). Nunca devolve o hash do token.
meRouter.get('/sessions', async (req, res) => {
  const sessions = await prisma.userSession.findMany({
    where: { userId: req.userId, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    orderBy: { lastSeenAt: 'desc' },
  });
  res.json(sessions.map((s) => ({ ...s, current: s.id === req.sessionId })));
});

// Revoga uma sessão (outro dispositivo, ou a atual).
meRouter.delete('/sessions/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { count } = await prisma.userSession.deleteMany({ where: { id, userId: req.userId } });
  if (count === 0) throw notFound('SESSION_NOT_FOUND', 'Sessão não encontrada');
  if (id === req.sessionId) clearSessionCookie(res);
  res.status(204).end();
});

// RF11 — exportação de todos os dados (direito de portabilidade, RGPD). Sem hashes nem tokens.
meRouter.get('/export', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId },
    include: {
      semesters: true,
      disciplines: { include: { assessments: true } },
      tasks: true,
      studySessions: true,
      scheduleBlocks: true,
      studyPreferences: true,
      availabilityRules: true,
      plannedSessions: true,
      studyPlans: { select: { id: true, version: true, status: true, fromDate: true, toDate: true, createdAt: true } },
      importJobs: {
        select: { id: true, kind: true, status: true, originalFilename: true, createdAt: true, counts: true },
      },
      sessions: { select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true } },
      studyDocuments: true,
      // Os vetores são derivados do texto (e grandes): exporta-se o texto de cada excerto.
      documentChunks: { select: { id: true, documentId: true, ordinal: true, content: true } },
      studyCards: true,
      cardReviews: true,
      quizzes: true,
      financeCategories: true,
      transactions: true,
      savingsGoals: true,
      financeInsights: true,
    },
  });
  const { passwordHash: _hash, tokenVersion: _tv, ...data } = user;
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="studentos-export-${date}.json"`);
  res.json({ exportedAt: new Date().toISOString(), ...data });
});

// Exportar o plano para o calendário pessoal (.ics). Só com a sessão iniciada e descarregado como ficheiro:
// não há link público nem token de subscrição. É gerado a pedido e não fica guardado.
// Inclui, a partir de hoje (Lisboa): sessões planeadas (exceto retiradas), avaliações com data e prazos por fazer.
meRouter.get('/calendar.ics', async (req, res) => {
  const now = new Date();
  const todayKey = zonedDayKey(now, DEFAULT_TIMEZONE);
  const today = startOfZonedDay(todayKey, DEFAULT_TIMEZONE);
  const discipline = { select: { name: true, code: true } } as const;
  const [sessions, assessments, tasks] = await Promise.all([
    prisma.plannedSession.findMany({
      where: { userId: req.userId, status: { not: 'CANCELLED' }, endAt: { gt: now } },
      include: { task: { select: { title: true } }, assessment: { select: { name: true } }, discipline },
      orderBy: { startAt: 'asc' },
    }),
    prisma.assessment.findMany({
      where: { discipline: { userId: req.userId }, date: { gte: today } },
      include: { discipline },
      orderBy: { date: 'asc' },
    }),
    prisma.task.findMany({
      where: { userId: req.userId, status: 'TODO', dueDate: { gte: today } },
      include: { discipline },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  const title = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  const percent = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });
  const events: ExportEvent[] = [
    ...sessions.map((s) => ({
      uid: `planned-session-${s.id}@studentos`,
      summary: title('Estudar', s.discipline?.code, s.task?.title ?? s.assessment?.name),
      description: title(`Sessão de estudo planeada no StudentOS (${s.plannedMinutes} min)`, s.discipline?.name),
      lastModified: s.updatedAt,
      when: { start: s.startAt, end: s.endAt },
      alarmMinutesBefore: 30,
    })),
    ...assessments.map((a) => ({
      uid: `assessment-${a.id}@studentos`,
      summary: title('Avaliação', a.discipline.code, a.name),
      description: title(a.discipline.name, `vale ${percent.format(a.weight)}% da nota`),
      lastModified: a.updatedAt,
      when: { day: zonedDayKey(a.date!, DEFAULT_TIMEZONE) },
      alarmMinutesBefore: 15 * 60, // véspera, às 09:00
    })),
    ...tasks.map((t) => ({
      uid: `task-${t.id}@studentos`,
      summary: title('Prazo', t.discipline?.code, t.title),
      description: title('Tarefa por fazer no StudentOS', t.discipline?.name),
      lastModified: t.updatedAt,
      when: { day: zonedDayKey(t.dueDate!, DEFAULT_TIMEZONE) },
      alarmMinutesBefore: 15 * 60,
    })),
  ];

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="studentos-calendario-${todayKey}.ics"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buildCalendar(events, now));
});

// Mudar a palavra-passe: exige a atual; termina todas as sessões (outros dispositivos incluídos)
// e abre uma nova neste, para um cookie eventualmente roubado deixar de servir.
meRouter.post('/password', async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw validationError([{ path: 'currentPassword', message: 'A palavra-passe atual está incorreta' }]);
  }
  if (isCommonPassword(newPassword)) {
    throw validationError([{ path: 'newPassword', message: 'Esta palavra-passe é demasiado comum' }]);
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
    prisma.userSession.deleteMany({ where: { userId: user.id } }),
  ]);
  await startSession(req, res, user.id);
  res.status(204).end();
});

// RF12 / HU06 — eliminação da conta e de todos os dados (cascata, incluindo sessões e importações).
// Pede o email e a palavra-passe: é irreversível.
meRouter.delete('/', async (req, res) => {
  const { confirmEmail, password } = parse(deleteAccountSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  if (user.email !== confirmEmail) {
    throw new HttpError(400, 'CONFIRMATION_MISMATCH', 'O email de confirmação não corresponde à conta');
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw validationError([{ path: 'password', message: 'A palavra-passe está incorreta' }]);
  }
  await prisma.user.delete({ where: { id: user.id } });
  clearSessionCookie(res);
  res.status(204).end();
});
