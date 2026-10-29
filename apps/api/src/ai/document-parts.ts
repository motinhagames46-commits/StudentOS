// O que a IA recebe de cada documento: o ficheiro original (fotografias, PDF), para ler também imagens, figuras
// e tabelas; ou o texto transcrito, nos documentos sem ficheiro guardado (anteriores) ou quando o limite enche.
import { prisma } from '../lib/prisma.js';
import type { AiPart } from './provider.js';

/** O Gemini aceita até 20 MB por pedido, já em base64 (mais um terço): fica margem para o resto. */
export const MAX_INLINE_BYTES = 12 * 1024 * 1024;
/** Texto de reserva por documento, quando o ficheiro não vai. */
const MAX_FALLBACK_CHARS = 30_000;

export interface DocumentSource {
  id: number;
  title: string;
  /** Usado só se o ficheiro não for (documento antigo ou limite cheio). */
  fallbackText: string;
}

/** Partes numeradas «Documento [n]», pela ordem dada; os ficheiros entram enquanto couberem no limite. */
export async function documentParts(userId: number, docs: DocumentSource[]): Promise<AiPart[]> {
  // Primeiro só os tamanhos: o conteúdo carrega-se apenas dos documentos que cabem no limite.
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
        select: { documentId: true, mimeType: true, data: true },
      })
    : [];

  return docs.flatMap((doc, i): AiPart[] => [
    { text: `Documento [${i + 1}]: «${doc.title}»` },
    ...(fits.has(doc.id)
      ? files
          .filter((f) => f.documentId === doc.id)
          .map((f) => ({ inlineData: { mimeType: f.mimeType, data: Buffer.from(f.data).toString('base64') } }))
      : [{ text: doc.fallbackText.slice(0, MAX_FALLBACK_CHARS) }]),
  ]);
}
