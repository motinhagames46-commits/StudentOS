// Documentos lidos pela IA (fotografias e PDFs): envio, propostas de datas e confirmação.
// A IA só propõe; o que fica gravado passa por estes esquemas, no browser e no servidor.
import { z } from 'zod';
import { assessmentTypes, type AssessmentType } from './schemas.js';

export const documentMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type DocumentMimeType = (typeof documentMimeTypes)[number];

/** Limite do conjunto de ficheiros de um documento (antes do base64). */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MAX_FILES = 10;

export const documentCreateSchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        filename: z.string().trim().min(1).max(255),
        mimeType: z.enum(documentMimeTypes, 'Usa fotografias (JPEG, PNG ou WebP) ou um PDF'),
        /** Conteúdo em base64 (sem o prefixo data:). */
        data: z
          .string()
          .min(1)
          .max(Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4, 'O documento tem mais de 10 MB'),
      }),
    )
    .min(1, 'Escolhe pelo menos um ficheiro')
    .max(DOCUMENT_MAX_FILES, `No máximo ${DOCUMENT_MAX_FILES} ficheiros por documento`),
  disciplineId: z.number().int().positive().nullable().optional(),
});

const dateOnly = z.iso.date('Data inválida');
const timeOfDay = z.iso.time({ precision: -1, error: 'Hora inválida' });

export const documentConfirmItemSchema = z
  .strictObject({
    target: z.enum(['assessment', 'task']),
    title: z.string('Indica o título').trim().min(1, 'Indica o título').max(100),
    date: dateOnly.nullable(),
    time: timeOfDay.nullable(),
    disciplineId: z.number().int().positive().nullable(),
    assessmentType: z.enum(assessmentTypes),
    weight: z.number('Indica o peso').gt(0, 'O peso tem de ser maior que 0').max(100).nullable(),
    minScore: z.number().min(0).max(20).nullable(),
    /** Avaliação já existente: só se lhe acrescenta a data, em vez de criar outra. */
    assessmentId: z.number().int().positive().nullable(),
  })
  .superRefine((item, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (item.target === 'task') return;
    if (item.assessmentId) {
      if (!item.date) issue('date', 'Indica a data para atualizar a avaliação');
      return;
    }
    if (!item.disciplineId) issue('disciplineId', 'Escolhe a disciplina da avaliação');
    if (item.weight === null) issue('weight', 'Indica o peso da avaliação');
  });

export const documentConfirmSchema = z.strictObject({ items: z.array(documentConfirmItemSchema).max(100) });

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;
export type DocumentConfirmItem = z.infer<typeof documentConfirmItemSchema>;

/** Data, avaliação ou prazo encontrado no documento, à espera de revisão. */
export interface DocumentProposal {
  target: 'assessment' | 'task';
  title: string;
  /** AAAA-MM-DD, em hora de Lisboa. */
  date: string | null;
  /** HH:MM, só quando está escrita no documento. */
  time: string | null;
  assessmentType: AssessmentType;
  weight: number | null;
  minScore: number | null;
  /** Excerto do documento onde a IA encontrou a informação. */
  evidence: string;
}

export interface DocumentProposalView extends DocumentProposal {
  /** Avaliação da disciplina do documento com o mesmo nome. */
  match: { id: number; name: string; date: string | null } | null;
  /** Já existe com a mesma data: por omissão não se grava. */
  duplicate: boolean;
}

export interface StudyDocumentSummary {
  id: number;
  title: string;
  source: 'SCAN' | 'PDF' | 'TEXT';
  pageCount: number;
  createdAt: string;
  disciplineId: number | null;
  pendingProposals: number;
  /** PROCESSING enquanto a IA lê (em segundo plano); FAILED com o motivo em `failureReason`. */
  status: 'PROCESSING' | 'READY' | 'FAILED';
  failureReason: string | null;
}

export interface StudyDocumentView extends StudyDocumentSummary {
  text: string;
  proposals: DocumentProposalView[];
}
