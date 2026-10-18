// Aulas e eventos criados à mão (spec §6.1 ScheduleBlock, origem MANUAL) e gestão de séries.
import { Router } from 'express';
import {
  DEFAULT_TIMEZONE,
  calendarQuerySchema,
  idParamSchema,
  scheduleBlockCreateSchema,
  scheduleBlockUpdateSchema,
  skipOccurrenceSchema,
} from '@studentos/shared';
import { blockOccurrences } from '../lib/calendar.js';
import { HttpError, notFound, parse, validationError } from '../lib/http.js';
import { fingerprintOf } from '../lib/imports/review.js';
import { findOwnedDiscipline } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';
import { computeSeriesEnd, expandOccurrences, validateRecurrenceRule, weeklyUntilRule } from '../lib/recurrence.js';

export const scheduleBlocksRouter = Router();

async function findOwnedBlock(userId: number, id: number) {
  const block = await prisma.scheduleBlock.findFirst({ where: { id, userId } });
  if (!block) throw notFound('BLOCK_NOT_FOUND', 'Aula ou evento não encontrado');
  return block;
}

// GET /api/schedule-blocks?from=&to= — ocorrências no intervalo
scheduleBlocksRouter.get('/', async (req, res) => {
  const { from, to } = parse(calendarQuerySchema, req.query);
  res.json(await blockOccurrences(req.userId, new Date(from), new Date(to)));
});

scheduleBlocksRouter.post('/', async (req, res) => {
  const input = parse(scheduleBlockCreateSchema, req.body);
  if (input.disciplineId) await findOwnedDiscipline(req.userId, input.disciplineId);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const recurrenceRule = input.repeatWeeklyUntil ? weeklyUntilRule(input.repeatWeeklyUntil, DEFAULT_TIMEZONE) : null;
  const series = { startAt, endAt, timezone: DEFAULT_TIMEZONE, recurrenceRule, exceptionDates: [] };
  if (recurrenceRule) {
    const problem = validateRecurrenceRule(recurrenceRule, series);
    if (problem) throw validationError([{ path: 'repeatWeeklyUntil', message: problem }]);
  }
  const block = await prisma.scheduleBlock.create({
    data: {
      userId: req.userId,
      title: input.title,
      kind: input.kind ?? 'CLASS',
      location: input.location ?? null,
      description: input.description ?? null,
      startAt,
      endAt,
      timezone: DEFAULT_TIMEZONE,
      isBusy: input.isBusy ?? true,
      recurrenceRule,
      seriesEndAt: computeSeriesEnd(series),
      fingerprint: fingerprintOf({ title: input.title, startAt, endAt, recurrenceRule }),
      disciplineId: input.disciplineId ?? null,
      origin: 'MANUAL',
    },
  });
  res.status(201).json(block);
});

scheduleBlocksRouter.patch('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const input = parse(scheduleBlockUpdateSchema, req.body);
  const block = await findOwnedBlock(req.userId, id);
  if (input.disciplineId) await findOwnedDiscipline(req.userId, input.disciplineId);
  const title = input.title ?? block.title;
  const updated = await prisma.scheduleBlock.update({
    where: { id },
    data: { ...input, fingerprint: fingerprintOf({ ...block, title }) },
  });
  res.json(updated);
});

scheduleBlocksRouter.delete('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedBlock(req.userId, id);
  await prisma.scheduleBlock.delete({ where: { id } });
  res.status(204).end();
});

// Cancela uma única ocorrência de uma série (sem destruir a regra semanal).
scheduleBlocksRouter.post('/:id/skip', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { occurrenceStart } = parse(skipOccurrenceSchema, req.body);
  const block = await findOwnedBlock(req.userId, id);
  if (!block.recurrenceRule) throw new HttpError(400, 'NOT_RECURRING', 'Este evento não é recorrente; elimina-o');
  const at = new Date(occurrenceStart);
  const exists = expandOccurrences(block, new Date(at.getTime() - 1), new Date(at.getTime() + 1)).some(
    (o) => o.start.getTime() === at.getTime(),
  );
  if (!exists) throw notFound('OCCURRENCE_NOT_FOUND', 'Ocorrência não encontrada');
  const updated = await prisma.scheduleBlock.update({
    where: { id },
    data: { exceptionDates: { push: at } },
  });
  res.json(updated);
});
