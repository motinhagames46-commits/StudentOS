// O que a IA recebe de cada documento: o ficheiro original (fotografias, PDF), para ler também imagens, figuras
// e tabelas; ou o texto transcrito, nos documentos sem ficheiro guardado (anteriores) ou quando o limite enche.
// O ficheiro vai uma vez para a Files API do Gemini (48 h) e as perguntas seguintes mandam só o endereço: o
// conteúdo não sai da base de dados em cada pergunta (o Neon gratuito tem 5 GB de tráfego por mês).
import { prisma } from '../lib/prisma.js';
import { logServerError } from '../middleware/errors.js';
import type { AiPart, AiProvider } from './provider.js';

/** Teto de ficheiros por pedido (tokens e tempo de resposta; e o limite de 20 MB se tiverem de ir no pedido). */
export const MAX_INLINE_BYTES = 12 * 1024 * 1024;
/** Texto de reserva por documento, quando o ficheiro não vai. */
const MAX_FALLBACK_CHARS = 30_000;
/** Um endereço a menos disto de expirar é renovado (a resposta pode demorar minutos). */
const REUSE_MARGIN_MS = 30 * 60 * 1000;

export interface DocumentSource {
  id: number;
  title: string;
  /** Usado só se o ficheiro não for (documento antigo ou limite cheio). */
  fallbackText: string;
}

/** Partes numeradas «Documento [n]», pela ordem dada; os ficheiros entram enquanto couberem no limite. */
export async function documentParts(ai: AiProvider, userId: number, docs: DocumentSource[]): Promise<AiPart[]> {
  // Primeiro só os tamanhos: decide-se o que cabe sem carregar conteúdo.
  const sizes = await prisma.documentFile.groupBy({
    by: ['documentId'],
    where: { userId, documentId: { in: docs.map((d) => d.id) } },
    _sum: { size: true },
  });
  let budget = MAX_INLINE_BYTES;
  const fits = new Set<number>();
  for (const doc of docs) {
    const size = sizes.find((s) => s.documentId === doc.id)?._sum.size ?? 0;
    if (size > 0 && size <= budget) {
      budget -= size;
      fits.add(doc.id);
    }
  }
  const files = fits.size
    ? await prisma.documentFile.findMany({
        where: { userId, documentId: { in: [...fits] } },
        orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }],
        select: {
          id: true,
          documentId: true,
          filename: true,
          mimeType: true,
          geminiUri: true,
          geminiExpiresAt: true,
          geminiScope: true,
        },
      })
    : [];

  const parts = new Map<number, AiPart>();
  const now = Date.now();
  const stale = files.filter((f) => {
    const valid =
      f.geminiUri && f.geminiScope === ai.fileScope && (f.geminiExpiresAt?.getTime() ?? 0) > now + REUSE_MARGIN_MS;
    if (valid) parts.set(f.id, { fileData: { mimeType: f.mimeType, fileUri: f.geminiUri! } });
    return !valid;
  });
  // Só o que não tem endereço válido sai da base de dados, uma vez por 48 h.
  const contents = stale.length
    ? await prisma.documentFile.findMany({
        where: { id: { in: stale.map((f) => f.id) } },
        select: { id: true, data: true },
      })
    : [];
  await Promise.all(
    stale.map(async (f) => {
      const data = contents.find((c) => c.id === f.id)!.data;
      try {
        const uploaded = await ai.uploadFile(data, f.mimeType, f.filename);
        await prisma.documentFile.update({
          where: { id: f.id },
          data: { geminiUri: uploaded.uri, geminiExpiresAt: uploaded.expiresAt, geminiScope: ai.fileScope },
        });
        parts.set(f.id, { fileData: { mimeType: f.mimeType, fileUri: uploaded.uri } });
      } catch (err) {
        // Sem a Files API, o ficheiro vai no próprio pedido (cabe: está dentro do teto).
        logServerError(`Envio do ficheiro ${f.id} para a Files API`, err);
        parts.set(f.id, { inlineData: { mimeType: f.mimeType, data: Buffer.from(data).toString('base64') } });
      }
    }),
  );

  return docs.flatMap((doc, i): AiPart[] => [
    { text: `Documento [${i + 1}]: «${doc.title}»` },
    ...(fits.has(doc.id)
      ? files.filter((f) => f.documentId === doc.id).map((f) => parts.get(f.id)!)
      : [{ text: doc.fallbackText.slice(0, MAX_FALLBACK_CHARS) }]),
  ]);
}
