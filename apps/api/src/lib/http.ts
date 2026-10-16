import type { z } from 'zod';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Erro com código HTTP e código de aplicação, convertido no formato único da secção 11.1. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[] | undefined;

  constructor(status: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (code = 'NOT_FOUND', message = 'Recurso não encontrado') =>
  new HttpError(404, code, message);

export const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada');

export const validationError = (details: ErrorDetail[]) =>
  new HttpError(400, 'VALIDATION_ERROR', 'Dados inválidos', details);

/** Valida `data` com um esquema Zod e lança 400 com os detalhes por campo. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
