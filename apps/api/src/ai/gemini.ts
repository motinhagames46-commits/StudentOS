// Gemini pela API REST (sem SDK): a chave vai no cabeçalho x-goog-api-key, nunca no URL nem em logs.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { logServerInfo } from '../middleware/errors.js';
import {
  AiError,
  EMBEDDING_DIMENSIONS,
  normalize,
  type AiPart,
  type AiProvider,
  type GenerateOptions,
  type UploadedFile,
  type WebAnswer,
} from './provider.js';

const ROOT_URL = 'https://generativelanguage.googleapis.com';
const BASE_URL = `${ROOT_URL}/v1beta/models`;
/** Um ficheiro acabado de enviar pode ainda estar a ser processado: espera até isto. */
const FILE_READY_TRIES = 10;
const FILE_READY_WAIT_MS = 1000;
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
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      cachedContentTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
    })
    .optional(),
});
const embedResponse = z.object({ embeddings: z.array(z.object({ values: z.array(z.number()) })) });
const fileInfo = z.object({
  name: z.string(),
  uri: z.string(),
  state: z.string().optional(),
  expirationTime: z.string(),
});

const mb = (chars: number) => `${(chars / 1_048_576).toFixed(1)}MB`;

/**
 * Uma linha por chamada no registo do servidor (procurar «[ia]» nos logs do Render): o que demorou e porquê.
 * Só nomes e números, nunca o conteúdo nem a chave. `describe` corre no fim, já com os tokens da resposta.
 */
async function logged<T>(describe: () => string, call: () => Promise<T>): Promise<T> {
  const started = Date.now();
  let status = 'ok';
  try {
    return await call();
  } catch (err) {
    status = err instanceof AiError ? err.code : 'erro';
    throw err;
  } finally {
    logServerInfo(`[ia] ${describe()} ms=${Date.now() - started} estado=${status}`);
  }
}

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
  readonly fileScope: string;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    readonly embeddingModel: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.fileScope = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  }

  private call(path: string, body: unknown): Promise<unknown> {
    return this.request(`${BASE_URL}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => res.json().catch(() => null));
  }

  /** Pedido com a chave no cabeçalho; erros de rede e estados HTTP viram erros da app. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'x-goog-api-key': this.apiKey },
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
    return res;
  }

  uploadFile(data: Uint8Array, mimeType: string, displayName: string): Promise<UploadedFile> {
    return logged(
      () => `envio-ficheiro tipo=${mimeType} tamanho=${mb(data.length)}`,
      () => this.upload(data, mimeType, displayName),
    );
  }

  /** Envio retomável da Files API (início, depois conteúdo e fim); espera que o ficheiro fique ACTIVE. */
  private async upload(data: Uint8Array, mimeType: string, displayName: string): Promise<UploadedFile> {
    const start = await this.request(`${ROOT_URL}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(data.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
    });
    const uploadUrl = start.headers.get('x-goog-upload-url');
    const invalid = (detail: string) =>
      new AiError('AI_INVALID_RESPONSE', 'O envio do ficheiro para a IA não correu bem.', detail);
    if (!uploadUrl?.startsWith(`${ROOT_URL}/`)) throw invalid('Gemini upload sem URL');

    const done = await this.request(uploadUrl, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: data,
    });
    const parsed = z.object({ file: fileInfo }).safeParse(await done.json().catch(() => null));
    if (!parsed.success) throw invalid('Gemini upload sem ficheiro');
    let file = parsed.data.file;
    for (let i = 0; file.state === 'PROCESSING' && i < FILE_READY_TRIES; i++) {
      await new Promise((r) => setTimeout(r, FILE_READY_WAIT_MS));
      const again = fileInfo.safeParse(
        await (await this.request(`${ROOT_URL}/v1beta/${file.name}`, { method: 'GET' })).json().catch(() => null),
      );
      if (!again.success) throw invalid('Gemini ficheiro ilegível');
      file = again.data;
    }
    if (file.state && file.state !== 'ACTIVE') throw invalid(`Gemini ficheiro ${file.state}`);
    return { uri: file.uri, expiresAt: new Date(file.expirationTime) };
  }

  /** Primeiro candidato com texto; resposta cortada ou vazia viram erros da app. */
  private generate(
    parts: AiPart[],
    options: GenerateOptions,
    extra: { generationConfig?: Record<string, unknown>; tools?: unknown[] },
  ) {
    // Raciocínio alto por omissão, por escolha do dono (qualidade antes da rapidez); explícito porque nem todos
    // os modelos Flash o têm por omissão. «low» existe em todos os modelos de texto («minimal» não).
    const thinking = options.thinking ?? 'high';
    const sent = parts.reduce(
      (n, p) => n + ('inlineData' in p ? p.inlineData.data.length : 'text' in p ? p.text.length : 0),
      0,
    );
    const files = parts.filter((p) => !('text' in p)).length;
    let usage: z.output<typeof generateResponse>['usageMetadata'];
    return logged(
      () =>
        `${options.task ?? 'pedido'} modelo=${this.model} raciocínio=${thinking} envio=${mb(sent)} ficheiros=${files} ` +
        `tokens=entrada:${usage?.promptTokenCount ?? '?'},cache:${usage?.cachedContentTokenCount ?? 0},` +
        `pensamento:${usage?.thoughtsTokenCount ?? 0},saída:${usage?.candidatesTokenCount ?? '?'}`,
      async () => {
        const data = generateResponse.safeParse(
          await this.call(`${encodeURIComponent(this.model)}:generateContent`, {
            contents: [{ role: 'user', parts }],
            ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
            ...(extra.tools ? { tools: extra.tools } : {}),
            generationConfig: { thinkingConfig: { thinkingLevel: thinking }, ...extra.generationConfig },
          }),
        );
        usage = data.success ? data.data.usageMetadata : undefined;
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
      },
    );
  }

  async generateJson<T extends z.ZodType>(schema: T, parts: AiPart[], options: GenerateOptions = {}) {
    // O $schema (versão do JSON Schema) não faz parte do formato que a API aceita.
    const { $schema: _version, ...responseJsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    const { text } = await this.generate(parts, options, {
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

  async searchAnswer(parts: AiPart[], options: GenerateOptions = {}): Promise<WebAnswer> {
    const { text, grounding } = await this.generate(
      parts,
      { task: 'pesquisa-web', ...options },
      { tools: [{ google_search: {} }] },
    );
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

  embed(texts: string[], task: 'document' | 'query'): Promise<number[][]> {
    return logged(
      () => `vetores textos=${texts.length}`,
      () => this.embedTexts(texts, task),
    );
  }

  private async embedTexts(texts: string[], task: 'document' | 'query'): Promise<number[][]> {
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
