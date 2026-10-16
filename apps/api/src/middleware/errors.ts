import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { env } from '../lib/env.js';
import { HttpError } from '../lib/http.js';

/** Rejeita pedidos que alteram dados com corpo que não seja JSON (proteção CSRF, secção 12.2). */
export function requireJsonBody(req: Request, _res: Response, next: NextFunction): void {
  const mutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  const contentType = req.headers['content-type'];
  if (mutating && contentType && !req.is('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Os pedidos têm de ser enviados em JSON');
  }
  next();
}

export function apiNotFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, 'ROUTE_NOT_FOUND', 'Rota não encontrada'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  let error: HttpError;

  if (err instanceof HttpError) {
    error = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    error = new HttpError(409, 'CONFLICT', 'Já existe um registo com estes dados');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    error = new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado');
  } else if (isBodyParserError(err)) {
    error = new HttpError(400, 'INVALID_JSON', 'O corpo do pedido não é JSON válido');
  } else {
    if (!env.isTest) console.error(err);
    error = new HttpError(500, 'INTERNAL_ERROR', 'Ocorreu um erro inesperado');
  }

  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')
  );
}
