// Gemini pela API REST (sem SDK): a chave vai no cabeçalho x-goog-api-key, nunca no URL nem em logs.
import { z } from 'zod';
import { AiError, EMBEDDING_DIMENSIONS, normalize, type AiPart, type AiProvider, type WebAnswer } from './provider.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Com raciocínio alto, um PDF com várias páginas leva minutos (a leitura de documentos corre em segundo plano).
const TIMEOUT_MS = 300_000;

const generateResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
        finishReason: z.string().optional(),
        groundingMetadata: z
          .object({
            groundingChunks: z
              .array(z.object({ web: z.object({ uri: z.string(), title: z.string().optional() }).optional() }))
              .optional(),
            searchEntryPoint: z.object({ renderedContent: z.string().optional() }).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
const embedResponse = z.object({ embeddings: z.array(z.object({ values: z.array(z.number()) })) });

/**
 * Pedido que nem chegou a ter resposta: diz qual foi a razão. Para o registo do servidor seguem só o nome e o
 * código do erro, nunca a mensagem (num cabeçalho inválido, a mensagem traz a própria chave).
 */
function unreachable(err: unknown): AiError {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  const detail = `Gemini sem resposta: ${e.name ?? 'Error'} ${e.cause?.code ?? ''}`.trim();
  if (e.name === 'TimeoutError') {
    return new AiError('AI_UNAVAILABLE', 'O serviço de IA demorou demasiado a responder. Tenta novamente.', detail);
  }
  if (e.name === 'TypeError' && e.message?.includes('header')) {
    return new AiError(
      'AI_UNAVAILABLE',
      'A chave do Gemini no servidor tem um formato inválido. Volta a copiá-la para GEMINI_API_KEY, sem espaços nem quebras de linha.',
      detail,
    );
  }
  return new AiError('AI_UNAVAILABLE', 'Não foi possível contactar o serviço de IA. Tenta novamente.', detail);
}

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
    } catch (err) {
      throw unreachable(err);
    }
    if (res.status === 429) {
      throw new AiError('AI_RATE_LIMITED', 'O serviço de IA atingiu o limite de pedidos. Tenta daqui a pouco.');
    }
    if (!res.ok) {
      throw new AiError(
        'AI_UNAVAILABLE',
        `O serviço de IA respondeu com um erro (${res.status}).`,
        `Gemini HTTP ${res.status}`,
      );
    }
    return res.json().catch(() => null);
  }

  /** Primeiro candidato com texto; resposta cortada ou vazia viram erros da app. */
  private async generate(
    parts: AiPart[],
    system: string | undefined,
    extra: { generationConfig?: Record<string, unknown>; tools?: unknown[] },
  ) {
    const data = generateResponse.safeParse(
      await this.call(`${encodeURIComponent(this.model)}:generateContent`, {
        contents: [{ role: 'user', parts }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(extra.tools ? { tools: extra.tools } : {}),
        // Raciocínio alto por escolha do dono (qualidade antes da rapidez); explícito porque nem todos os
        // modelos Flash o têm por omissão.
        generationConfig: { thinkingConfig: { thinkingLevel: 'high' }, ...extra.generationConfig },
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
    return { text, grounding: candidate?.groundingMetadata };
  }

  async generateJson<T extends z.ZodType>(schema: T, parts: AiPart[], options: { system?: string } = {}) {
    // O $schema (versão do JSON Schema) não faz parte do formato que a API aceita.
    const { $schema: _version, ...responseJsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    const { text } = await this.generate(parts, options.system, {
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema },
    });

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

  async searchAnswer(parts: AiPart[], options: { system?: string } = {}): Promise<WebAnswer> {
    const { text, grounding } = await this.generate(parts, options.system, { tools: [{ google_search: {} }] });
    const sources = new Map<string, string>();
    for (const chunk of grounding?.groundingChunks ?? []) {
      // Só ligações https chegam a um <a href> na página.
      if (chunk.web?.uri.startsWith('https://') && !sources.has(chunk.web.uri)) {
        sources.set(chunk.web.uri, chunk.web.title || chunk.web.uri);
      }
    }
    return {
      text,
      sources: [...sources].map(([url, title]) => ({ title, url })),
      searchSuggestionsHtml: grounding?.searchEntryPoint?.renderedContent ?? null,
    };
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
