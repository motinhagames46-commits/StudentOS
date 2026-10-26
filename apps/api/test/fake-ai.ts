// Fornecedor de IA falso para os testes: respostas JSON em fila e vetores determinísticos (sem rede).
import type { z } from 'zod';
import {
  AiError,
  EMBEDDING_DIMENSIONS,
  normalize,
  type AiPart,
  type AiProvider,
  type WebAnswer,
} from '../src/ai/provider.js';

export class FakeAiProvider implements AiProvider {
  readonly model = 'fake';
  readonly embeddingModel = 'fake-embedding';
  readonly requests: AiPart[][] = [];
  readonly searches: AiPart[][] = [];
  /** Vetor devolvido para perguntas (task 'query'), para os testes escolherem o que fica mais perto. */
  queryVector: number[] | null = null;

  constructor(private readonly responses: unknown[] = []) {}

  async generateJson<T extends z.ZodType>(schema: T, parts: AiPart[]): Promise<z.output<T>> {
    this.requests.push(parts);
    const result = schema.safeParse(this.responses.shift());
    if (!result.success) throw new AiError('AI_INVALID_RESPONSE', 'A resposta da IA não veio no formato esperado.');
    return result.data;
  }

  async searchAnswer(parts: AiPart[]): Promise<WebAnswer> {
    this.searches.push(parts);
    const answer = this.responses.shift() as WebAnswer | undefined;
    if (!answer?.text) throw new AiError('AI_BLOCKED', 'O serviço de IA não devolveu resposta para este pedido.');
    return answer;
  }

  async embed(texts: string[], task: 'document' | 'query' = 'document'): Promise<number[][]> {
    if (task === 'query' && this.queryVector) return texts.map(() => this.queryVector!);
    return texts.map((text) =>
      normalize(Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (text.charCodeAt(i % text.length) || 1) % 7)),
    );
  }
}
