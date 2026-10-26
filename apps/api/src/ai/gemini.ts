// Gemini pela API REST (sem SDK): a chave vai no cabeçalho x-goog-api-key, nunca no URL nem em logs.
import { z } from 'zod';
import { AiError, EMBEDDING_DIMENSIONS, normalize, type AiPart, type AiProvider } from './provider.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Um PDF com várias páginas pode levar bem mais de um minuto a transcrever.
const TIMEOUT_MS = 120_000;

const generateResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
});
const embedResponse = z.object({ embeddings: z.array(z.object({ values: z.array(z.number()) })) });

export class GeminiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    readonly embeddingModel: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(path: string, body: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE_URL}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AiError('AI_UNAVAILABLE', 'Não foi possível contactar o serviço de IA. Tenta novamente.');
    }
    if (res.status === 429) {
      throw new AiError('AI_RATE_LIMITED', 'O serviço de IA atingiu o limite de pedidos. Tenta daqui a pouco.');
    }
    if (!res.ok) throw new AiError('AI_UNAVAILABLE', `O serviço de IA respondeu com um erro (${res.status}).`);
    return res.json().catch(() => null);
  }

  async generateJson<T extends z.ZodType>(schema: T, parts: AiPart[], options: { system?: string } = {}) {
    // O $schema (versão do JSON Schema) não faz parte do formato que a API aceita.
    const { $schema: _version, ...responseJsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    const data = generateResponse.safeParse(
      await this.call(`${encodeURIComponent(this.model)}:generateContent`, {
        contents: [{ role: 'user', parts }],
        ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema },
      }),
    );
    const candidate = data.success ? data.data.candidates?.[0] : undefined;
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new AiError(
        'AI_INVALID_RESPONSE',
        'A resposta da IA ficou cortada por ser demasiado longa. Divide o documento em partes mais pequenas.',
      );
    }
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new AiError('AI_BLOCKED', 'O serviço de IA não devolveu resposta para este pedido.');

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError('AI_INVALID_RESPONSE', 'A resposta da IA não veio no formato esperado.');
    }
    const result = schema.safeParse(json);
    if (!result.success) throw new AiError('AI_INVALID_RESPONSE', 'A resposta da IA não veio no formato esperado.');
    return result.data;
  }

  async embed(texts: string[], task: 'document' | 'query'): Promise<number[][]> {
    if (texts.length === 0) return [];
    const model = `models/${this.embeddingModel}`;
    const data = embedResponse.safeParse(
      await this.call(`${encodeURIComponent(this.embeddingModel)}:batchEmbedContents`, {
        requests: texts.map((text) => ({
          model,
          content: { parts: [{ text }] },
          taskType: task === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY',
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
    );
    const vectors = data.success ? data.data.embeddings.map((e) => e.values) : [];
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
      throw new AiError('AI_INVALID_RESPONSE', 'Os vetores devolvidos pela IA não têm o formato esperado.');
    }
    // Com dimensão reduzida, os vetores do Gemini não vêm normalizados.
    return vectors.map(normalize);
  }
}
