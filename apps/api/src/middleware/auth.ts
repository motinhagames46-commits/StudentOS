import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySession } from '../lib/auth.js';
import { unauthorized } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId: number;
  }
}

/** Exige sessão válida: JWT assinado e tokenVersion igual ao do utilizador (secção 12.2). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySession(token) : null;
  if (!session) throw unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, tokenVersion: true },
  });
  if (!user || user.tokenVersion !== session.tokenVersion) throw unauthorized();

  req.userId = user.id;
  next();
}
