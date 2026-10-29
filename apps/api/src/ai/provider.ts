// Contrato da IA: a app depende disto, nunca de chamadas ao Gemini espalhadas pelo código.
// «A IA propõe, o código valida»: as respostas estruturadas são sempre validadas com o mesmo esquema Zod.
import type { z } from 'zod';

/** Parte de um pedido: texto, ou uma imagem/PDF em base64. */
export type AiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Dimensão dos vetores dos excertos (o Gemini reduz para esta dimensão; normalizamos a seguir). */
export const EMBEDDING_DIMENSIONS = 768;

export interface AiProvider {
  readonly model: string;
  readonly embeddingModel: string;
  /** JSON que cumpre o esquema (enviado como JSON Schema) e validado com o mesmo Zod; senão, AiError. */
  generateJson<T extends z.ZodType>(schema: T, parts: AiPart[], options?: { system?: string }): Promise<z.output<T>>;
  /** Um vetor normalizado (comprimento 1) por texto, para a semelhança ser um produto interno. */
  embed(texts: string[], task: 'document' | 'query'): Promise<number[][]>;
  /** Resposta em texto com pesquisa Google: as fontes e as sugestões de pesquisa vêm do próprio Gemini. */
  searchAnswer(parts: AiPart[], options?: { system?: string }): Promise<WebAnswer>;
}

export interface WebAnswer {
  text: string;
  sources: { title: string; url: string }[];
  /** HTML das sugestões de pesquisa (searchEntryPoint), a mostrar sem alterações. */
  searchSuggestionsHtml: string | null;
}

export type AiErrorCode = 'AI_UNAVAILABLE' | 'AI_RATE_LIMITED' | 'AI_BLOCKED' | 'AI_INVALID_RESPONSE';

/** Erro do fornecedor, já em português e sem detalhes técnicos (o errorHandler converte-o em HTTP). */
export class AiError extends Error {
  readonly code: AiErrorCode;
  /** Detalhe técnico para o registo do servidor (nome e código do erro); nunca segredos nem a resposta. */
  readonly detail: string | null;
  constructor(code: AiErrorCode, message: string, detail: string | null = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return length === 0 ? vector : vector.map((x) => x / length);
}
