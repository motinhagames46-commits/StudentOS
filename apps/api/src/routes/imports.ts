// Importação de horários (spec §8.2): ficheiro → pré-visualização editável → confirmação explícita.
// Nada é gravado em ScheduleBlock/Task antes de POST /:id/confirm.
import { Router } from 'express';
import {
  DEFAULT_TIMEZONE,
  importConfirmSchema,
  importCreateSchema,
  type CsvPreviewOptions,
  type ImportCounts,
  type ImportItem,
  type ImportItemEdit,
  type ImportJobView,
} from '@studentos/shared';
import type { ImportJob, Prisma } from '../generated/prisma/client.js';
import { HttpError, notFound, parse, validationError, type ErrorDetail } from '../lib/http.js';
import { CsvParseError, parseCsv } from '../lib/imports/csv.js';
import { IcsParseError, parseIcs } from '../lib/imports/ics.js';
import { fingerprintOf, reviewItems } from '../lib/imports/review.js';
import { prisma } from '../lib/prisma.js';
import { computeSeriesEnd } from '../lib/recurrence.js';

export const importsRouter = Router();

const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

interface StoredOptions {
  csv?: CsvPreviewOptions;
  dateFormatChosen?: boolean;
}

function toView(job: ImportJob): ImportJobView {
  const options = (job.options ?? {}) as StoredOptions;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    originalFilename: job.originalFilename,
    createdAt: job.createdAt.toISOString(),
    expiresAt: job.expiresAt.toISOString(),
    confirmedAt: job.confirmedAt?.toISOString() ?? null,
    items: job.items as unknown as ImportItem[],
    warnings: (job.warnings ?? []) as string[],
    counts: (job.counts ?? null) as ImportCounts | null,
    csv: options.csv ?? null,
  };
}

/** Limpeza preguiçosa (o plano gratuito não tem tarefas agendadas): expira pré-visualizações antigas. */
async function expireOldJobs(userId: number) {
  const now = new Date();
  await prisma.importJob.updateMany({
    where: { userId, status: 'NEEDS_REVIEW', expiresAt: { lt: now } },
    data: { status: 'EXPIRED', items: [] },
  });
  await prisma.importJob.deleteMany({
    where: {
      userId,
      status: { in: ['EXPIRED', 'FAILED'] },
      createdAt: { lt: new Date(now.getTime() - HISTORY_RETENTION_MS) },
    },
  });
}

async function findOwnedJob(userId: number, id: string) {
  const job = await prisma.importJob.findFirst({ where: { id, userId } });
  if (!job) throw notFound('IMPORT_NOT_FOUND', 'Importação não encontrada');
  return job;
}

/** Valida o tipo real do conteúdo, sem confiar na extensão nem no Content-Type do browser. */
function checkContent(kind: 'ICS' | 'CSV', filename: string, content: string) {
  const ext = filename.toLowerCase().split('.').pop();
  if ((kind === 'ICS' && ext !== 'ics') || (kind === 'CSV' && ext !== 'csv')) {
    throw validationError([{ path: 'filename', message: `Escolhe um ficheiro .${kind.toLowerCase()}` }]);
  }
  if (content.includes('\u0000') || content.startsWith('PK')) {
    throw validationError([{ path: 'content', message: 'O ficheiro não é texto (formato binário ou comprimido)' }]);
  }
  if (kind === 'ICS' && !/^\s*BEGIN:VCALENDAR/i.test(content.replace(/^\uFEFF/, ''))) {
    throw validationError([{ path: 'content', message: 'O ficheiro não começa por BEGIN:VCALENDAR' }]);
  }
}

// POST /api/imports — analisa o ficheiro e devolve a pré-visualização (sem gravar dados académicos).
importsRouter.post('/', async (req, res) => {
  const input = parse(importCreateSchema, req.body);
  checkContent(input.kind, input.filename, input.content);
  await expireOldJobs(req.userId);

  let parsed: { items: ReturnType<typeof parseIcs>['items']; warnings: string[]; csv?: CsvPreviewOptions };
  try {
    if (input.kind === 'ICS') {
      parsed = parseIcs(input.content, DEFAULT_TIMEZONE);
    } else {
      const disciplines = await prisma.discipline.findMany({
        where: { userId: req.userId },
        select: { id: true, code: true, name: true },
      });
      parsed = parseCsv(input.content, input.csv ?? {}, DEFAULT_TIMEZONE, disciplines);
    }
  } catch (err) {
    if (err instanceof IcsParseError || err instanceof CsvParseError) {
      throw new HttpError(422, 'INVALID_FILE', err.message);
    }
    throw err;
  }

  const items = await reviewItems(req.userId, parsed.items, input.kind === 'ICS' ? 'IMPORT_ICS' : 'IMPORT_CSV');
  const counts: ImportCounts = {
    total: items.length,
    ready: items.filter((i) => i.action === 'create').length,
    duplicates: items.filter((i) => i.duplicate).length,
    errors: items.filter((i) => i.issues.some((x) => x.severity === 'error')).length,
  };
  const options: StoredOptions = {
    ...(parsed.csv ? { csv: parsed.csv } : {}),
    dateFormatChosen: Boolean(input.csv?.dateFormat),
  };

  const job = await prisma.importJob.create({
    data: {
      userId: req.userId,
      kind: input.kind,
      originalFilename: input.filename.slice(0, 255),
      items: items as unknown as Prisma.InputJsonValue,
      warnings: parsed.warnings,
      counts: counts as Prisma.InputJsonValue,
      options: options as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + JOB_TTL_MS),
    },
  });
  res.status(201).json(toView(job));
});

// GET /api/imports — histórico recente (sem itens).
importsRouter.get('/', async (req, res) => {
  await expireOldJobs(req.userId);
  const jobs = await prisma.importJob.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json(jobs.map((j) => ({ ...toView(j), items: [] })));
});

importsRouter.get('/:id', async (req, res) => {
  await expireOldJobs(req.userId);
  const job = await findOwnedJob(req.userId, req.params.id);
  if (job.status === 'EXPIRED') {
    throw new HttpError(410, 'IMPORT_EXPIRED', 'A pré-visualização expirou. Carrega o ficheiro outra vez.');
  }
  res.json(toView(job));
});

function applyEdit(item: ImportItem, edit: ImportItemEdit | undefined): ImportItem {
  if (!edit) return { ...item, action: 'skip' };
  return {
    ...item,
    action: edit.action,
    target: edit.target ?? item.target,
    title: edit.title ?? item.title,
    kind: edit.kind ?? item.kind,
    startAt: edit.startAt ?? item.startAt,
    endAt: edit.endAt ?? item.endAt,
    location: edit.location !== undefined ? edit.location : item.location,
    disciplineId: edit.disciplineId !== undefined ? edit.disciplineId : item.disciplineId,
    isBusy: edit.isBusy ?? item.isBusy,
  };
}

/** Validação final no servidor, sobre o item já editado. */
function validateFinal(item: ImportItem): string[] {
  const problems: string[] = [];
  if (!item.title.trim()) problems.push('Indica o título');
  if (item.issues.some((i) => i.field === 'recurrenceRule' && i.severity === 'error')) {
    problems.push('Recorrência não suportada: este item não pode ser importado');
  }
  if (item.target === 'block') {
    if (!item.startAt || !item.endAt) problems.push('Indica o início e o fim');
    else if (new Date(item.endAt) <= new Date(item.startAt) && !item.allDay) {
      problems.push('O fim tem de ser depois do início');
    }
  }
  return problems;
}

// POST /api/imports/:id/confirm — grava, numa transação, apenas os itens confirmados.
importsRouter.post('/:id/confirm', async (req, res) => {
  const { items: edits } = parse(importConfirmSchema, req.body);
  const job = await findOwnedJob(req.userId, req.params.id);
  if (job.status === 'CONFIRMED')
    throw new HttpError(409, 'IMPORT_ALREADY_CONFIRMED', 'Esta importação já foi confirmada');
  if (job.status !== 'NEEDS_REVIEW' || job.expiresAt < new Date()) {
    throw new HttpError(410, 'IMPORT_EXPIRED', 'A pré-visualização expirou. Carrega o ficheiro outra vez.');
  }
  const options = (job.options ?? {}) as StoredOptions;
  if (options.csv?.dateFormatAmbiguous && !options.dateFormatChosen) {
    throw new HttpError(
      409,
      'DATE_FORMAT_UNCONFIRMED',
      'Confirma o formato das datas (dia/mês ou mês/dia) antes de importar',
    );
  }

  const editByKey = new Map(edits.map((e) => [e.key, e]));
  const items = (job.items as unknown as ImportItem[]).map((item) => applyEdit(item, editByKey.get(item.key)));
  const chosen = items.filter((i) => i.action !== 'skip');

  const details: ErrorDetail[] = [];
  for (const item of chosen) {
    for (const message of validateFinal(item)) details.push({ path: `items.${item.key}`, message });
  }
  const disciplineIds = [...new Set(chosen.map((i) => i.disciplineId).filter((x): x is number => x !== null))];
  if (disciplineIds.length) {
    const owned = await prisma.discipline.count({ where: { userId: req.userId, id: { in: disciplineIds } } });
    if (owned !== disciplineIds.length) details.push({ path: 'items', message: 'Disciplina não encontrada' });
  }
  if (details.length) throw validationError(details);

  const origin = job.kind === 'ICS' ? 'IMPORT_ICS' : 'IMPORT_CSV';
  const counts = await prisma.$transaction(async (tx) => {
    const result = { created: 0, updated: 0, skipped: items.length - chosen.length, failed: 0 };
    for (const item of chosen) {
      if (item.target === 'task') {
        const data = {
          title: item.title,
          description: item.description,
          dueDate: item.startAt ? new Date(item.startAt) : null,
          disciplineId: item.disciplineId,
        };
        if (item.action === 'update' && item.externalId) {
          const { count } = await tx.task.updateMany({
            where: { userId: req.userId, origin, externalId: item.externalId },
            data,
          });
          result[count ? 'updated' : 'failed']++;
        } else {
          const { count } = await tx.task.createMany({
            data: [{ ...data, userId: req.userId, origin, externalId: item.externalId, importJobId: job.id }],
            skipDuplicates: true,
          });
          result[count ? 'created' : 'skipped']++;
        }
        continue;
      }

      const startAt = new Date(item.startAt!);
      const endAt = new Date(item.endAt!);
      const exceptionDates = item.exceptionDates.map((d) => new Date(d));
      const seriesEndAt = computeSeriesEnd({
        startAt,
        endAt,
        timezone: item.timezone,
        recurrenceRule: item.recurrenceRule,
        exceptionDates,
      });
      const data = {
        title: item.title,
        kind: item.kind,
        location: item.location,
        description: item.description,
        startAt,
        endAt,
        allDay: item.allDay,
        timezone: item.timezone,
        isBusy: item.isBusy,
        recurrenceRule: item.recurrenceRule,
        exceptionDates,
        seriesEndAt,
        fingerprint: fingerprintOf({ ...item, startAt, endAt }),
        disciplineId: item.disciplineId,
        sourceLabel: job.originalFilename,
      };
      if (item.action === 'update' && item.externalId) {
        const { count } = await tx.scheduleBlock.updateMany({
          where: { userId: req.userId, origin, externalId: item.externalId },
          data,
        });
        result[count ? 'updated' : 'failed']++;
      } else {
        const { count } = await tx.scheduleBlock.createMany({
          data: [{ ...data, userId: req.userId, origin, externalId: item.externalId, importJobId: job.id }],
          skipDuplicates: true,
        });
        result[count ? 'created' : 'skipped']++;
      }
    }

    // Minimização de dados: os itens da pré-visualização deixam de ser necessários.
    await tx.importJob.update({
      where: { id: job.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), items: [], counts: result },
    });
    return result;
  });

  res.json({ counts });
});

// DELETE /api/imports/:id — cancela uma pré-visualização (nada foi gravado).
importsRouter.delete('/:id', async (req, res) => {
  const job = await findOwnedJob(req.userId, req.params.id);
  if (job.status === 'CONFIRMED') {
    throw new HttpError(409, 'IMPORT_ALREADY_CONFIRMED', 'Esta importação já foi confirmada; usa "Anular importação"');
  }
  await prisma.importJob.delete({ where: { id: job.id } });
  res.status(204).end();
});

// DELETE /api/imports/:id/data — anula uma importação confirmada (apaga o que ela criou).
importsRouter.delete('/:id/data', async (req, res) => {
  const job = await findOwnedJob(req.userId, req.params.id);
  const removed = await prisma.$transaction(async (tx) => {
    const blocks = await tx.scheduleBlock.deleteMany({ where: { userId: req.userId, importJobId: job.id } });
    const tasks = await tx.task.deleteMany({ where: { userId: req.userId, importJobId: job.id } });
    const counts = { ...((job.counts ?? {}) as ImportCounts), removed: blocks.count + tasks.count };
    await tx.importJob.update({ where: { id: job.id }, data: { counts } });
    return blocks.count + tasks.count;
  });
  res.json({ removed });
});
