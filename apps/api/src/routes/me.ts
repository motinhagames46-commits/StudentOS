import { Router } from 'express';
import { deleteAccountSchema } from '@studentos/shared';
import { clearSessionCookie } from '../lib/auth.js';
import { HttpError, parse } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

export const meRouter = Router();

export function publicUser(user: { id: number; name: string; email: string; createdAt: Date }) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

meRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  const activeSemester = await prisma.semester.findFirst({
    where: { userId: req.userId, isActive: true },
  });
  res.json({ user: publicUser(user), activeSemester });
});

// RF11 — exportação de todos os dados (direito de portabilidade, RGPD)
meRouter.get('/export', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId },
    include: {
      semesters: true,
      disciplines: { include: { assessments: true } },
      tasks: true,
      studySessions: true,
    },
  });
  const { passwordHash: _hash, tokenVersion: _tv, ...data } = user;
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="studentos-export-${date}.json"`);
  res.json({ exportedAt: new Date().toISOString(), ...data });
});

// RF12 / HU06 — eliminação da conta e de todos os dados (cascata)
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
