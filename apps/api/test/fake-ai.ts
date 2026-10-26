// Fornecedor de IA falso para os testes: respostas JSON em fila e vetores determinísticos (sem rede).
import type { z } from 'zod';
import { AiError, EMBEDDING_DIMENSIONS, normalize, type AiPart, type AiProvider } from '../src/ai/provider.js';

export class FakeAiProvider implements AiProvider {
  readonly model = 'fake';
  readonly requests: AiPart[][] = [];

  constructor(private readonly responses: unknown[] = []) {}

  async generateJson<T extends z.ZodType>(schema: T, parts: AiPart[]): Promise<z.output<T>> {
    this.requests.push(parts);
    const result = schema.safeParse(this.responses.shift());
    if (!result.success) throw new AiError('AI_INVALID_RESPONSE', 'A resposta da IA não veio no formato esperado.');
    return result.data;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) =>
      normalize(Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (text.charCodeAt(i % text.length) || 1) % 7)),
    );
  }
}
