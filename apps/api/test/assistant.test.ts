import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAiProviderForTests } from '../src/ai/access.js';
import { GeminiProvider } from '../src/ai/gemini.js';
import { EMBEDDING_DIMENSIONS } from '../src/ai/provider.js';
import { documentParts, MAX_INLINE_BYTES } from '../src/ai/document-parts.js';
import { app } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { FakeAiProvider } from './fake-ai.js';
import { createUserAndLogin, resetDb } from './helpers.js';

/** Vetor unitário no eixo `axis` (os excertos de teste ficam ortogonais entre si). */
const unit = (axis: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0));
const web = {
  text: 'Segundo a web, a 3FN elimina dependências transitivas.',
  sources: [],
  searchSuggestionsHtml: '<div>chips</div>',
};

let owner: string[];
let other: string[];
let disciplineId: number;
let fake: FakeAiProvider;

async function addChunk(
  email: string,
  title: string,
  content: string,
  axis: number,
  options: { model?: string; disciplineId?: number } = {},
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const doc = await prisma.studyDocument.create({
    data: {
      title,
      source: 'SCAN',
      status: 'READY',
      text: content,
      userId: user.id,
      disciplineId: options.disciplineId ?? null,
    },
  });
  await prisma.documentChunk.create({
    data: {
      ordinal: 0,
      content,
      embedding: unit(axis),
      embeddingModel: options.model ?? 'fake-embedding',
      documentId: doc.id,
      userId: user.id,
    },
  });
  return doc.id;
}

function ask(responses: unknown[], body: Record<string, unknown>, cookie = owner) {
  fake = new FakeAiProvider(responses);
  fake.queryVector = unit(0);
  setAiProviderForTests(fake);
  return request(app).post('/api/assistant/ask').set('Cookie', cookie).send(body);
}

const promptOf = (parts: unknown[] | undefined) => JSON.stringify(parts ?? []);

beforeEach(async () => {
  await resetDb();
  ({ cookie: owner, disciplineId } = await createUserAndLogin('dono'));
  ({ cookie: other } = await createUserAndLogin('colega'));
  env.AI_ALLOWED_EMAILS = ['dono@exemplo.pt'];
  await request(app).post('/api/ai/consent').set('Cookie', owner);
});

afterEach(() => {
  env.AI_ALLOWED_EMAILS = [];
  setAiProviderForTests(undefined);
});

describe('POST /api/assistant/ask', () => {
  it('responde com os excertos mais próximos da conta e devolve as fontes citadas', async () => {
    const normalizacao = await addChunk(
      'dono@exemplo.pt',
      'Apontamentos BD',
      'A 3FN elimina dependências transitivas.',
      0,
    );
    await addChunk('dono@exemplo.pt', 'Redes', 'O TCP garante a entrega ordenada.', 1);
    await addChunk('colega@exemplo.pt', 'Segredos do colega', 'Texto privado do colega.', 0);

    const res = await ask(
      // [7] não existe: sai do texto e das fontes.
      [{ sufficient: true, answer: 'A 3FN elimina dependências transitivas [1] [7].', citations: [1, 1, 7] }],
      { question: 'O que é a 3FN?' },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mode: 'documents',
      answer: 'A 3FN elimina dependências transitivas [1].',
      sources: [
        {
          kind: 'document',
          n: 1,
          documentId: normalizacao,
          title: 'Apontamentos BD',
          excerpt: 'A 3FN elimina dependências transitivas.',
        },
      ],
      searchSuggestionsHtml: null,
    });
    const prompt = promptOf(fake.requests[0]);
    expect(prompt.indexOf('Apontamentos BD')).toBeLessThan(prompt.indexOf('Redes')); // o mais próximo primeiro
    expect(prompt).not.toContain('colega');
    expect(fake.searches).toHaveLength(0);
  });

  it('se os documentos não chegam (ou não há fontes válidas), procura na web e marca a resposta', async () => {
    await addChunk('dono@exemplo.pt', 'Redes', 'O TCP garante a entrega ordenada.', 1);
    const sources = [{ title: 'exemplo.pt', url: 'https://exemplo.pt/3fn' }];
    const res = await ask(
      [
        { sufficient: true, answer: 'Sem fontes.', citations: [] },
        { ...web, sources },
      ],
      { question: 'O que é a 3FN?', history: [{ role: 'user', text: 'Fala-me de BD' }] },
    );
    expect(res.body).toEqual({
      mode: 'web',
      answer: web.text,
      sources: [{ kind: 'web', n: 1, title: 'exemplo.pt', url: 'https://exemplo.pt/3fn' }],
      searchSuggestionsHtml: '<div>chips</div>',
    });
    // Para a pesquisa Google vai só a pergunta, sem a conversa.
    expect(fake.searches[0]).toEqual([{ text: 'O que é a 3FN?' }]);
  });

  it('sem documentos vai direto à web; excertos de outro modelo de vetores não contam', async () => {
    await addChunk('dono@exemplo.pt', 'Antigo', 'Vetor de outro modelo.', 0, { model: 'modelo-antigo' });
    const res = await ask([web], { question: 'O que é a 3FN?' });
    expect(res.body.mode).toBe('web');
    expect(fake.requests).toHaveLength(0);
  });

  it('filtra por disciplina da conta; disciplina de outra conta dá 404', async () => {
    await addChunk('dono@exemplo.pt', 'De PW', 'Conteúdo de PW.', 0, { disciplineId });
    await addChunk('dono@exemplo.pt', 'Sem disciplina', 'Conteúdo solto.', 0);
    await ask([{ sufficient: true, answer: 'Resposta [1].', citations: [1] }], { question: 'PW?', disciplineId });
    expect(promptOf(fake.requests[0])).not.toContain('Sem disciplina');

    const theirs = await prisma.discipline.findFirstOrThrow({ where: { user: { email: 'colega@exemplo.pt' } } });
    expect((await ask([], { question: 'PW?', disciplineId: theirs.id })).status).toBe(404);
  });

  it('só com a IA ativa e com uma pergunta válida', async () => {
    const res = await ask([web], { question: 'Olá' }, other);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AI_NOT_ENABLED');
    expect((await ask([], { question: '   ' })).status).toBe(400);
  });
});

describe('o assistente lê os documentos originais', () => {
  it('envia o ficheiro guardado (com imagens) em vez do texto; sem ficheiro, envia o texto', async () => {
    const withFile = await addChunk('dono@exemplo.pt', 'Diagrama ER', 'texto transcrito do diagrama', 0);
    await addChunk('dono@exemplo.pt', 'Notas antigas', 'notas sem ficheiro guardado', 1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dono@exemplo.pt' } });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
    await prisma.documentFile.create({
      data: {
        documentId: withFile,
        userId: user.id,
        ordinal: 0,
        filename: 'er.png',
        mimeType: 'image/png',
        size: png.length,
        data: new Uint8Array(png),
      },
    });

    await ask([{ sufficient: true, answer: 'Resposta [1].', citations: [1] }], { question: 'Que entidades há?' });
    const parts = fake.requests[0]!;
    expect(parts).toContainEqual({ text: 'Documento [1]: «Diagrama ER»' });
    expect(parts).toContainEqual({ fileData: { mimeType: 'image/png', fileUri: 'fake://files/1' } });
    expect(fake.uploads).toEqual([{ mimeType: 'image/png', size: png.length }]);
    expect(JSON.stringify(parts)).not.toContain('texto transcrito do diagrama');
    expect(parts).toContainEqual({ text: 'notas sem ficheiro guardado' });
  });
});

describe('Gemini com pesquisa Google', () => {
  it('pede a ferramenta google_search e devolve fontes sem repetidos e as sugestões de pesquisa', async () => {
    const body = {
      candidates: [
        {
          content: { parts: [{ text: 'Resposta da web.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://a.pt', title: 'a.pt' } },
              { web: { uri: 'https://a.pt', title: 'a.pt' } },
              { web: { uri: 'https://b.pt' } },
              { web: { uri: 'javascript:alert(1)', title: 'não' } },
            ],
            searchEntryPoint: { renderedContent: '<style></style><div>chips</div>' },
          },
        },
      ],
    };
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    );
    const gemini = new GeminiProvider('k', 'm', 'e', fetchMock as unknown as typeof fetch);
    expect(await gemini.searchAnswer([{ text: 'pergunta' }])).toEqual({
      text: 'Resposta da web.',
      sources: [
        { title: 'a.pt', url: 'https://a.pt' },
        { title: 'https://b.pt', url: 'https://b.pt' },
      ],
      searchSuggestionsHtml: '<style></style><div>chips</div>',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).tools).toEqual([{ google_search: {} }]);
  });
});

describe('documentParts (Files API do Gemini)', () => {
  async function docWithFile(title: string, size: number) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dono@exemplo.pt' } });
    const doc = await prisma.studyDocument.create({
      data: { title, source: 'PDF', status: 'READY', text: `texto de ${title}`, userId: user.id },
    });
    const file = await prisma.documentFile.create({
      data: {
        documentId: doc.id,
        userId: user.id,
        ordinal: 0,
        filename: `${title}.pdf`,
        mimeType: 'application/pdf',
        // O tamanho registado decide o teto; o conteúdo do teste é pequeno.
        size,
        data: new Uint8Array(Buffer.from('%PDF-1.4')),
      },
    });
    return { user, source: { id: doc.id, title, fallbackText: `texto de ${title}` }, fileId: file.id };
  }

  it('envia uma vez, reutiliza o endereço e só volta a enviar quando expira ou a chave muda', async () => {
    const { user, source, fileId } = await docWithFile('BD', 10);
    const ai = new FakeAiProvider();
    const first = await documentParts(ai, user.id, [source]);
    expect(first).toEqual([
      { text: 'Documento [1]: «BD»' },
      { fileData: { mimeType: 'application/pdf', fileUri: 'fake://files/1' } },
    ]);
    // Segunda pergunta: o mesmo endereço, sem novo envio.
    expect(await documentParts(ai, user.id, [source])).toEqual(first);
    expect(ai.uploads).toHaveLength(1);

    // Prestes a expirar: volta a enviar.
    await prisma.documentFile.update({
      where: { id: fileId },
      data: { geminiExpiresAt: new Date(Date.now() + 60_000) },
    });
    await documentParts(ai, user.id, [source]);
    expect(ai.uploads).toHaveLength(2);
    // Outra chave: o endereço da anterior não serve.
    ai.fileScope = 'outra-chave';
    await documentParts(ai, user.id, [source]);
    expect(ai.uploads).toHaveLength(3);
  });

  it('o que não cabe no teto vai em texto; se a Files API falhar, o ficheiro vai no pedido', async () => {
    const big = await docWithFile('Grande', MAX_INLINE_BYTES);
    const small = await docWithFile('Pequeno', 10);
    const ai = new FakeAiProvider();
    ai.failUploads = true;
    const parts = await documentParts(ai, big.user.id, [big.source, small.source]);
    expect(parts).toEqual([
      { text: 'Documento [1]: «Grande»' },
      { inlineData: { mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4').toString('base64') } },
      { text: 'Documento [2]: «Pequeno»' },
      { text: 'texto de Pequeno' }, // já não cabia
    ]);
  });
});
