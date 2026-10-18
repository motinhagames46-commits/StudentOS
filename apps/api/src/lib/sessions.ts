// Sessões de autenticação guardadas no servidor (spec §14.1): logout real, rotação no login,
// expiração no servidor e revogação individual.
import type { Request, Response } from 'express';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearSessionCookie,
  hashSessionToken,
  newSessionToken,
  setSessionCookie,
} from './auth.js';
import { prisma } from './prisma.js';

const LAST_SEEN_RESOLUTION_MS = 60 * 60 * 1000;

function cookieToken(req: Request): string | null {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 0 && token.length <= 200 ? token : null;
}

function userAgentOf(req: Request): string | null {
  const ua = req.get('user-agent');
  return ua ? ua.slice(0, 200) : null;
}

/**
 * Cria uma sessão nova para o utilizador e envia o cookie. Qualquer sessão trazida pelo pedido é
 * destruída primeiro (rotação do identificador de sessão no login).
 */
export async function startSession(req: Request, res: Response, userId: number): Promise<void> {
  const previous = cookieToken(req);
  const { token, tokenHash } = newSessionToken();
  const now = new Date();

  await prisma.$transaction([
    ...(previous ? [prisma.userSession.deleteMany({ where: { tokenHash: hashSessionToken(previous) } })] : []),
    prisma.userSession.deleteMany({ where: { userId, expiresAt: { lt: now } } }),
    prisma.userSession.create({
      data: { tokenHash, userId, userAgent: userAgentOf(req), expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
    }),
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now } }),
  ]);
  setSessionCookie(res, token);
}

/** Devolve a sessão válida associada ao pedido, ou null. Sessões expiradas são removidas. */
export async function resolveSession(req: Request): Promise<{ id: number; userId: number } | null> {
  const token = cookieToken(req);
  if (!token) return null;

  const session = await prisma.userSession.findUnique({ where: { tokenHash: hashSessionToken(token) } });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.userSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
    await prisma.userSession.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  return { id: session.id, userId: session.userId };
}

/** Termina a sessão do pedido (logout real: a sessão deixa de existir no servidor). */
export async function endSession(req: Request, res: Response): Promise<void> {
  const token = cookieToken(req);
  if (token) await prisma.userSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  clearSessionCookie(res);
}

/** Termina todas as sessões do utilizador em todos os dispositivos. */
export async function endAllSessions(userId: number, res: Response): Promise<void> {
  await prisma.userSession.deleteMany({ where: { userId } });
  clearSessionCookie(res);
}
