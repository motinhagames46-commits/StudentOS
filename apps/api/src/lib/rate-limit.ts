// Limites de pedidos (secção 12.3), por IP. As respostas 429 usam o formato de erro comum (spec §13.2).
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

const tooManyRequests = (message: string) => (req: Request, res: Response) => {
  res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message, requestId: req.requestId } });
};

/** Limite geral da API. */
export const generalLimiter = (limit = 300) =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequests('Demasiados pedidos. Espera alguns minutos e tenta novamente.'),
  });

/** Tentativas falhadas em operações que verificam a palavra-passe (login, registo, mudar, eliminar conta). */
export const credentialLimiter = (limit = 10) =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequests('Demasiadas tentativas. Tenta novamente daqui a 15 minutos.'),
  });
