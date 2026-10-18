import { Router } from 'express';
import { deleteAccountSchema, idParamSchema } from '@studentos/shared';
import { clearSessionCookie } from '../lib/auth.js';
import { HttpError, notFound, parse } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

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
    },
  });
  const { passwordHash: _hash, tokenVersion: _tv, ...data } = user;
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="studentos-export-${date}.json"`);
  res.json({ exportedAt: new Date().toISOString(), ...data });
});

// RF12 / HU06 — eliminação da conta e de todos os dados (cascata, incluindo sessões e importações)
meRouter.delete('/', async (req, res) => {
  const { confirmEmail } = parse(deleteAccountSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  if (user.email !== confirmEmail) {
    throw new HttpError(400, 'CONFIRMATION_MISMATCH', 'O email de confirmação não corresponde à conta');
  }
  await prisma.user.delete({ where: { id: user.id } });
  clearSessionCookie(res);
  res.status(204).end();
});
