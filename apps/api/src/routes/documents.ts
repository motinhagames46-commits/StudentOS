// Documentos (passo 2 da IA): fotografias ou PDF → o Gemini transcreve e propõe datas → o estudante revê e
// confirma. Os ficheiros ficam guardados para a IA os reler (com imagens) nas perguntas e nos quizzes; o texto
// transcrito serve a busca dos excertos.
import express, { Router } from 'express';
import {
  DEFAULT_TIMEZONE,
  DOCUMENT_MAX_BYTES,
  addDaysToKey,
  documentConfirmSchema,
  documentCreateSchema,
  exceedsWeightLimit,
  idParamSchema,
  startOfZonedDay,
  weightSum,
  zonedDayKey,
  zonedToInstant,
  type DocumentMimeType,
  type DocumentProposal,
  type DocumentProposalView,
  type StudyDocumentSummary,
  type StudyDocumentView,
} from '@studentos/shared';
import { aiProvider } from '../ai/access.js';
import { AiError } from '../ai/provider.js';
import { chunkText, embedChunks, extractDocument } from '../ai/documents.js';
import type { StudyDocument } from '../generated/prisma/client.js';
import { HttpError, notFound, parse, validationError } from '../lib/http.js';
import { findOwnedDiscipline } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';
import { requireAi } from '../middleware/ai.js';
import { logServerError } from '../middleware/errors.js';

export const documentsRouter = Router();

/** Assinaturas dos formatos aceites: não se confia no tipo indicado pelo browser. */
const signatures: Record<DocumentMimeType, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  'application/pdf': (b) => b.toString('latin1', 0, 5) === '%PDF-',
};

/** Confirma o formato pelos primeiros bytes e devolve o conteúdo já descodificado. */
function checkFiles(files: { filename: string; mimeType: DocumentMimeType; data: string }[]): Buffer[] {
  const decoded = files.map((file, i) => {
    const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(file.data) ? Buffer.from(file.data, 'base64') : null;
    if (!bytes || !signatures[file.mimeType](bytes)) {
      throw validationError([{ path: `files.${i}`, message: `«${file.filename}» não é uma imagem nem um PDF válido` }]);
    }
    return bytes;
  });
  if (decoded.reduce((sum, b) => sum + b.length, 0) > DOCUMENT_MAX_BYTES) {
    throw validationError([{ path: 'files', message: 'O documento tem mais de 10 MB' }]);
  }
  return decoded;
}

/** Espaço para ficheiros guardados por conta: a base de dados gratuita é pequena e cheia pararia a app toda. */
export const FILE_STORAGE_PER_USER_BYTES = 300 * 1024 * 1024;

async function findOwnedDocument(userId: number, id: number) {
  const document = await prisma.studyDocument.findFirst({ where: { id, userId } });
  if (!document) throw notFound('DOCUMENT_NOT_FOUND', 'Documento não encontrado');
  return document;
}

const proposalsOf = (doc: StudyDocument) => doc.proposals as unknown as DocumentProposal[];

function summary(doc: StudyDocument): StudyDocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    source: doc.source,
    pageCount: doc.pageCount,
    createdAt: doc.createdAt.toISOString(),
    disciplineId: doc.disciplineId,
    pendingProposals: proposalsOf(doc).length,
    status: doc.status,
    failureReason: doc.failureReason,
  };
}

const sameTitle = (a: string, b: string) =>
  a.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ') ===
  b.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const dayKey = (date: Date | null) => (date ? zonedDayKey(date, DEFAULT_TIMEZONE) : null);

/** Liga cada proposta ao que já existe: a avaliação com o mesmo nome na disciplina e tarefas iguais no mesmo dia. */
async function view(userId: number, doc: StudyDocument): Promise<StudyDocumentView> {
  const proposals = proposalsOf(doc);
  const assessments =
    doc.disciplineId && proposals.some((p) => p.target === 'assessment')
      ? await prisma.assessment.findMany({ where: { disciplineId: doc.disciplineId, discipline: { userId } } })
      : [];
  const days = proposals.filter((p) => p.target === 'task' && p.date).map((p) => p.date!);
  const tasks = days.length
    ? await prisma.task.findMany({
        where: {
          userId,
          dueDate: {
            gte: startOfZonedDay(
              days.reduce((a, b) => (a < b ? a : b)),
              DEFAULT_TIMEZONE,
            ),
            lt: startOfZonedDay(
              addDaysToKey(
                days.reduce((a, b) => (a > b ? a : b)),
                1,
              ),
              DEFAULT_TIMEZONE,
            ),
          },
        },
        select: { title: true, dueDate: true },
      })
    : [];

  const views: DocumentProposalView[] = proposals.map((p) => {
    if (p.target === 'task') {
      const duplicate = tasks.some((t) => dayKey(t.dueDate) === p.date && sameTitle(t.title, p.title));
      return { ...p, match: null, duplicate };
    }
    const found = assessments.find((a) => sameTitle(a.name, p.title));
    const match = found ? { id: found.id, name: found.name, date: found.date?.toISOString() ?? null } : null;
    return { ...p, match, duplicate: Boolean(found && (p.date === null || dayKey(found.date) === p.date)) };
  });
  return { ...summary(doc), text: doc.text, proposals: views };
}

/** Uma leitura parada há mais do que isto foi interrompida (o servidor reiniciou ou adormeceu a meio). */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/** Limpeza preguiçosa (o plano gratuito não tem tarefas agendadas), como nas importações. */
async function failStaleReadings(userId: number) {
  await prisma.studyDocument.updateMany({
    where: { userId, status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    data: { status: 'FAILED', failureReason: 'A leitura foi interrompida. Envia o documento outra vez.' },
  });
}

type UploadFile = { filename: string; mimeType: DocumentMimeType; data: string };

/**
 * Lê o documento com a IA e grava o resultado. Corre depois de responder ao pedido: com raciocínio alto, a
 * leitura leva minutos. Nunca lança: uma falha fica no documento (FAILED e o motivo) para o estudante ver.
 */
async function readDocument(id: number, userId: number, files: UploadFile[]) {
  try {
    const ai = aiProvider();
    if (!ai) throw new AiError('AI_UNAVAILABLE', 'A IA deixou de estar configurada no servidor.');
    const parts = files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } }));
    const extracted = await extractDocument(ai, parts, zonedDayKey(new Date(), DEFAULT_TIMEZONE));
    if (!extracted.text) {
      throw new HttpError(
        422,
        'DOCUMENT_EMPTY',
        'Não foi possível ler texto neste documento. Tenta uma fotografia mais nítida.',
      );
    }
    const chunks = chunkText(extracted.text);
    const vectors = await embedChunks(ai, chunks);
    // Se o documento foi apagado entretanto, a transação falha e não fica nada para trás.
    await prisma.$transaction([
      prisma.documentChunk.createMany({
        data: chunks.map((content, ordinal) => ({
          documentId: id,
          ordinal,
          content,
          embedding: vectors[ordinal]!,
          embeddingModel: ai.embeddingModel,
          userId,
        })),
      }),
      prisma.studyDocument.update({
        where: { id },
        data: {
          status: 'READY',
          title: extracted.title || undefined,
          pageCount: extracted.pageCount || files.length,
          text: extracted.text,
          proposals: extracted.proposals as object[],
        },
      }),
    ]);
  } catch (err) {
    const known = err instanceof AiError || err instanceof HttpError;
    // Da IA fica só o detalhe seguro; um documento sem texto não é erro do servidor.
    if (!(err instanceof HttpError)) logServerError(`Leitura do documento ${id}`, err);
    await prisma.studyDocument
      .updateMany({
        where: { id, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          failureReason: known ? err.message : 'Ocorreu um erro inesperado ao ler o documento. Tenta outra vez.',
        },
      })
      .catch((e: unknown) => logServerError(`Leitura do documento ${id}`, e));
  }
}

// POST /api/documents — recebe o documento e começa a lê-lo em segundo plano (202); o estado vê-se no GET.
// Até 10 MB em base64 (mais um terço), lidos só depois da sessão, dos limites de pedidos e do acesso à IA.
documentsRouter.post('/', requireAi, express.json({ limit: '15mb' }), async (req, res) => {
  const input = parse(documentCreateSchema, req.body);
  const bytes = checkFiles(input.files);
  if (input.disciplineId) await findOwnedDiscipline(req.userId, input.disciplineId);
  const incoming = bytes.reduce((sum, b) => sum + b.length, 0);

  // Conta e grava sob a mesma tranca da conta: dois envios em simultâneo não passam juntos do teto.
  const doc = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${req.userId} FOR UPDATE`;
    const used = await tx.documentFile.aggregate({ where: { userId: req.userId }, _sum: { size: true } });
    if ((used._sum.size ?? 0) + incoming > FILE_STORAGE_PER_USER_BYTES) {
      throw new HttpError(
        413,
        'DOCUMENT_STORAGE_FULL',
        'O espaço para documentos (300 MB) está cheio. Apaga documentos antigos para enviares mais.',
      );
    }
    return tx.studyDocument.create({
      data: {
        title: input.files[0]!.filename.slice(0, 120),
        source: input.files.some((f) => f.mimeType === 'application/pdf') ? 'PDF' : 'SCAN',
        status: 'PROCESSING',
        pageCount: input.files.length,
        userId: req.userId,
        disciplineId: input.disciplineId ?? null,
        files: {
          create: input.files.map((f, ordinal) => ({
            ordinal,
            filename: f.filename.slice(0, 255),
            mimeType: f.mimeType,
            size: bytes[ordinal]!.length,
            data: new Uint8Array(bytes[ordinal]!),
            userId: req.userId,
          })),
        },
      },
    });
  });
  void readDocument(doc.id, req.userId, input.files);
  res.status(202).json(await view(req.userId, doc));
});

documentsRouter.get('/', async (req, res) => {
  await failStaleReadings(req.userId);
  const docs = await prisma.studyDocument.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(docs.map(summary));
});

documentsRouter.get('/:id', async (req, res) => {
  await failStaleReadings(req.userId);
  const doc = await findOwnedDocument(req.userId, parse(idParamSchema, req.params.id));
  res.json(await view(req.userId, doc));
});

// POST /api/documents/:id/confirm — grava só os itens escolhidos, numa transação; lista vazia = ignorar todos.
documentsRouter.post('/:id/confirm', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { items } = parse(documentConfirmSchema, req.body);
  const doc = await findOwnedDocument(req.userId, id);

  const disciplineIds = [...new Set(items.map((i) => i.disciplineId).filter((x): x is number => x !== null))];
  const disciplines = await prisma.discipline.findMany({
    where: { userId: req.userId, id: { in: disciplineIds } },
    select: { id: true, code: true },
  });
  if (disciplines.length !== disciplineIds.length) throw notFound('DISCIPLINE_NOT_FOUND', 'Disciplina não encontrada');

  const result = await prisma.$transaction(async (tx) => {
    // Reclama a revisão primeiro: uma segunda confirmação (duplo clique, outro separador) não grava nada.
    const claimed = await tx.studyDocument.updateMany({
      where: { id, userId: req.userId, NOT: { proposals: { equals: [] } } },
      data: { proposals: [] },
    });
    if (!claimed.count) {
      throw new HttpError(409, 'DOCUMENT_ALREADY_REVIEWED', 'As datas deste documento já foram revistas.');
    }

    const counts = { created: 0, updated: 0 };
    for (const [i, item] of items.entries()) {
      const [y, m, d] = item.date ? item.date.split('-').map(Number) : [];
      const [hour, minute] = (item.time ?? (item.target === 'task' ? '23:59' : '09:00')).split(':').map(Number);
      const date = item.date ? zonedToInstant(y!, m!, d!, hour!, minute!, DEFAULT_TIMEZONE) : null;

      if (item.target === 'task') {
        await tx.task.create({
          data: {
            title: item.title,
            description: `Do documento «${doc.title}»`,
            dueDate: date,
            disciplineId: item.disciplineId,
            userId: req.userId,
          },
        });
        counts.created++;
      } else if (item.assessmentId) {
        const { count } = await tx.assessment.updateMany({
          where: { id: item.assessmentId, discipline: { userId: req.userId } },
          data: { date },
        });
        if (!count) throw notFound('ASSESSMENT_NOT_FOUND', 'Avaliação não encontrada');
        counts.updated++;
      } else {
        // Tranca a disciplina: duas confirmações em simultâneo não somam pesos lidos antes da outra gravar.
        await tx.$queryRaw`SELECT id FROM "Discipline" WHERE id = ${item.disciplineId} FOR UPDATE`;
        const existing = await tx.assessment.findMany({
          where: { disciplineId: item.disciplineId! },
          select: { weight: true },
        });
        const current = weightSum(existing.map((a) => ({ weight: a.weight, score: null })));
        if (exceedsWeightLimit(current, item.weight!)) {
          const code = disciplines.find((x) => x.id === item.disciplineId)?.code ?? '';
          const formatted = current.toLocaleString('pt-PT', { maximumFractionDigits: 2 });
          throw validationError([
            {
              path: `items.${i}.weight`,
              message: `«${item.title}»: a soma dos pesos de ${code} não pode exceder 100% (atual: ${formatted}%)`,
            },
          ]);
        }
        await tx.assessment.create({
          data: {
            name: item.title,
            type: item.assessmentType,
            weight: item.weight!,
            minScore: item.minScore,
            date,
            disciplineId: item.disciplineId!,
          },
        });
        counts.created++;
      }
    }
    return counts;
  });
  res.json(result);
});

documentsRouter.delete('/:id', async (req, res) => {
  const doc = await findOwnedDocument(req.userId, parse(idParamSchema, req.params.id));
  await prisma.studyDocument.delete({ where: { id: doc.id } });
  res.status(204).end();
});
