import { Router } from 'express';
import { TERMS_VERSION, loginSchema, registerSchema, semesterFor } from '@studentos/shared';
import { hashPassword, isCommonPassword, verifyAgainstDummy, verifyPassword } from '../lib/auth.js';
import { HttpError, parse, validationError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { endAllSessions, endSession, startSession } from '../lib/sessions.js';
import { requireAuth } from '../middleware/auth.js';
import { meResponse, publicUser } from './me.js';

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
      // Prova da aceitação dos Termos (a validação exige acceptTerms: true).
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      semesters: { create: { ...semester, isActive: true } },
    },
  });

  await startSession(req, res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

// RF02 — cada login cria uma sessão nova (rotação do identificador)
authRouter.post('/login', async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  const valid = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await verifyAgainstDummy(input.password);
  if (!user || !valid) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email ou palavra-passe incorretos');
  }

  await startSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

// Logout real: a sessão é eliminada no servidor.
authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

// Termina todas as sessões do utilizador em todos os dispositivos.
authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await endAllSessions(req.userId, res);
  res.status(204).end();
});

// Contrato do spec §13 (equivalente a GET /api/me).
authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await meResponse(req.userId));
});
