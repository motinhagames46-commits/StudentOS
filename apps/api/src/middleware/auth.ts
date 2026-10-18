import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/http.js';
import { resolveSession } from '../lib/sessions.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId: number;
    sessionId: number;
    requestId: string;
  }
}

/** Exige uma sessão válida guardada no servidor (spec §14.1). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const session = await resolveSession(req);
  if (!session) throw unauthorized();
  req.userId = session.userId;
  req.sessionId = session.id;
  next();
}
