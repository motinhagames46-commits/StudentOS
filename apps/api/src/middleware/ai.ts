import type { NextFunction, Request, Response } from 'express';
import { aiStatusOf } from '../ai/access.js';
import { HttpError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

/** Rotas de IA: conta na lista, chave configurada e consentimento dado (depois do requireAuth). */
export async function requireAi(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId },
    select: { email: true, aiConsentAt: true },
  });
  if (aiStatusOf(user) !== 'ENABLED') {
    throw new HttpError(403, 'AI_NOT_ENABLED', 'A IA não está ativa nesta conta. Ativa-a na página Integrações.');
  }
  next();
}
