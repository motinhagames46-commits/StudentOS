import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { env } from '../lib/env.js';
import { HttpError } from '../lib/http.js';

const INCOMING_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Identificador de pedido (spec §13.2): reutiliza o do proxy se for seguro, senão gera um. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

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

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let error: HttpError;

  if (err instanceof HttpError) {
    error = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    error = new HttpError(409, 'CONFLICT', 'Já existe um registo com estes dados');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    error = new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado');
  } else if (bodyParserErrorType(err) === 'entity.too.large') {
    error = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'O pedido excede o tamanho máximo permitido');
  } else if (bodyParserErrorType(err) === 'entity.parse.failed') {
    error = new HttpError(400, 'INVALID_JSON', 'O corpo do pedido não é JSON válido');
  } else {
    // Detalhe técnico só no log do servidor, associado ao requestId; nunca na resposta.
    if (!env.isTest) console.error(`[${req.requestId}] ${req.method} ${req.path}`, err);
    error = new HttpError(500, 'INTERNAL_ERROR', 'Ocorreu um erro inesperado');
  }

  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      requestId: req.requestId,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

function bodyParserErrorType(err: unknown): string | null {
  return typeof err === 'object' && err !== null && 'type' in err && typeof err.type === 'string' ? err.type : null;
}
