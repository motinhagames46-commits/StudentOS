// Cliente HTTP da API. Usa o cookie de sessão httpOnly (credentials: 'include').

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Erros por campo, para mostrar junto a cada input. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Sem ligação ao servidor. Verifica a tua ligação.');
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toApiError(res);
  return (await res.json().catch(() => null)) as T;
}

/** Erro uniforme a partir de uma resposta da API ({ error: { code, message, details } }). */
async function toApiError(res: Response): Promise<ApiError> {
  const data: unknown = await res.json().catch(() => null);
  const error = (data as { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } } | null)?.error;
  return new ApiError(
    res.status,
    error?.code ?? 'UNKNOWN',
    error?.message ?? 'Ocorreu um erro inesperado',
    error?.details,
  );
}

/** Descarrega um ficheiro da API (com o cookie de sessão) e entrega-o ao browser com o nome indicado. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Sem ligação ao servidor. Verifica a tua ligação.');
  }
  if (!res.ok) throw await toApiError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado';
}
