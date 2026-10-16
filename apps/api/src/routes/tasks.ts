import { Router } from 'express';
import { idParamSchema, taskCreateSchema, taskQuerySchema, taskUpdateSchema } from '@studentos/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { parse } from '../lib/http.js';
import { findOwnedDiscipline, findOwnedTask } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';

export const tasksRouter = Router();

const disciplineSelect = { select: { id: true, name: true, code: true, color: true } } as const;

// RF06 — filtros e ordenação
tasksRouter.get('/', async (req, res) => {
  const q = parse(taskQuerySchema, req.query);

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    q.sort === 'priority'
      ? [{ priority: 'desc' }, { dueDate: { sort: 'asc', nulls: 'last' } }]
      : q.sort === 'createdAt'
        ? [{ createdAt: 'desc' }]
        : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }];

  const tasks = await prisma.task.findMany({
    where: {
      userId: req.userId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.disciplineId ? { disciplineId: q.disciplineId } : {}),
      ...(q.from || q.to
        ? { dueDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
        : {}),
    },
    include: { discipline: disciplineSelect },
    orderBy,
  });
  res.json(tasks);
});

// RF05 — a disciplina referenciada tem de pertencer ao utilizador (RN10, previne IDOR)
tasksRouter.post('/', async (req, res) => {
  const input = parse(taskCreateSchema, req.body);
  if (input.disciplineId) await findOwnedDiscipline(req.userId, input.disciplineId);
  const task = await prisma.task.create({
    data: { ...input, userId: req.userId },
    include: { discipline: disciplineSelect },
  });
  res.status(201).json(task);
});

tasksRouter.get('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedTask(req.userId, id);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id },
    include: { discipline: disciplineSelect },
  });
  res.json(task);
});

tasksRouter.patch('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const input = parse(taskUpdateSchema, req.body);
  const current = await findOwnedTask(req.userId, id);
  if (input.disciplineId) await findOwnedDiscipline(req.userId, input.disciplineId);

  const completedAt =
    input.status === undefined || input.status === current.status
      ? undefined
      : input.status === 'DONE'
        ? new Date()
        : null;

  const task = await prisma.task.update({
    where: { id },
    data: { ...input, ...(completedAt !== undefined ? { completedAt } : {}) },
    include: { discipline: disciplineSelect },
  });
  res.json(task);
});

tasksRouter.delete('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedTask(req.userId, id);
  await prisma.task.delete({ where: { id } });
  res.status(204).end();
});
