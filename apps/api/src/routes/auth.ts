import { Router } from 'express';
import { loginSchema, registerSchema, semesterFor } from '@studentos/shared';
import {
  clearSessionCookie,
  hashPassword,
  isCommonPassword,
  setSessionCookie,
  signSession,
  verifyAgainstDummy,
  verifyPassword,
} from '../lib/auth.js';
import { HttpError, parse, validationError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { publicUser } from './me.js';

export const authRouter = Router();

// RF01 / HU01
authRouter.post('/register', async (req, res) => {
  const input = parse(registerSchema, req.body);
  if (isCommonPassword(input.password)) {
    throw validationError([{ path: 'password', message: 'Esta palavra-passe é demasiado comum' }]);
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, 'EMAIL_TAKEN', 'Este email já está registado');

  const semester = semesterFor(new Date());
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      semesters: { create: { ...semester, isActive: true } },
    },
  });

  setSessionCookie(res, signSession(user));
  res.status(201).json({ user: publicUser(user) });
});

// RF02
authRouter.post('/login', async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  const valid = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await verifyAgainstDummy(input.password);
  if (!user || !valid) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email ou palavra-passe incorretos');
  }

  setSessionCookie(res, signSession(user));
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

// Termina todas as sessões do utilizador (incrementa tokenVersion).
authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.userId },
    data: { tokenVersion: { increment: 1 } },
  });
  clearSessionCookie(res);
  res.status(204).end();
});
