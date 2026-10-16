import { Router } from 'express';
import {
  assessmentCreateSchema,
  disciplineCreateSchema,
  disciplineUpdateSchema,
  exceedsWeightLimit,
  gradesQuerySchema,
  idParamSchema,
  weightSum,
} from '@studentos/shared';
import { z } from 'zod';
import { gradeSummary } from '../lib/grades.js';
import { HttpError, parse, validationError } from '../lib/http.js';
import { findOwnedDiscipline, findOwnedSemester } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';

export const disciplinesRouter = Router();

const assessmentOrder = [{ date: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }] as const;

const listQuery = z.object({ semesterId: z.coerce.number().int().positive().optional() });

disciplinesRouter.get('/', async (req, res) => {
  const { semesterId } = parse(listQuery, req.query);
  const disciplines = await prisma.discipline.findMany({
    where: { userId: req.userId, ...(semesterId ? { semesterId } : {}) },
    include: {
      assessments: { orderBy: [...assessmentOrder] },
      _count: { select: { tasks: { where: { status: 'TODO' } } } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(
    disciplines.map(({ _count, ...d }) => ({
      ...d,
      pendingTasks: _count.tasks,
      grades: gradeSummary(d),
    })),
  );
});

disciplinesRouter.post('/', async (req, res) => {
  const input = parse(disciplineCreateSchema, req.body);

  let semesterId = input.semesterId;
  if (semesterId) {
    await findOwnedSemester(req.userId, semesterId);
  } else if (semesterId === undefined) {
    const active = await prisma.semester.findFirst({ where: { userId: req.userId, isActive: true } });
    semesterId = active?.id ?? null;
  }

  const discipline = await prisma.discipline.create({
    data: { ...input, semesterId, userId: req.userId },
    include: { assessments: true },
  });
  res.status(201).json({ ...discipline, pendingTasks: 0, grades: gradeSummary(discipline) });
});

disciplinesRouter.get('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedDiscipline(req.userId, id);
  const discipline = await prisma.discipline.findUniqueOrThrow({
    where: { id },
    include: {
      assessments: { orderBy: [...assessmentOrder] },
      semester: true,
      _count: { select: { tasks: { where: { status: 'TODO' } } } },
    },
  });
  const { _count, ...rest } = discipline;
  res.json({ ...rest, pendingTasks: _count.tasks, grades: gradeSummary(discipline) });
});

disciplinesRouter.patch('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const input = parse(disciplineUpdateSchema, req.body);
  await findOwnedDiscipline(req.userId, id);
  if (input.semesterId) await findOwnedSemester(req.userId, input.semesterId);
  const discipline = await prisma.discipline.update({
    where: { id },
    data: input,
    include: { assessments: { orderBy: [...assessmentOrder] } },
  });
  res.json({ ...discipline, grades: gradeSummary(discipline) });
});

// RN12: as avaliações são eliminadas em cascata; as tarefas ficam sem disciplina.
disciplinesRouter.delete('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedDiscipline(req.userId, id);
  await prisma.discipline.delete({ where: { id } });
  res.status(204).end();
});

// RF08 / RF09 — médias e nota necessária
disciplinesRouter.get('/:id/grades', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { target } = parse(gradesQuerySchema, req.query);
  await findOwnedDiscipline(req.userId, id);
  const discipline = await prisma.discipline.findUniqueOrThrow({
    where: { id },
    include: { assessments: true },
  });
  res.json(gradeSummary(discipline, target));
});

disciplinesRouter.get('/:id/assessments', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedDiscipline(req.userId, id);
  const assessments = await prisma.assessment.findMany({
    where: { disciplineId: id },
    orderBy: [...assessmentOrder],
  });
  res.json(assessments);
});

// RF07 / HU02 — a soma dos pesos não pode exceder 100% (RN03)
disciplinesRouter.post('/:id/assessments', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const input = parse(assessmentCreateSchema, req.body);
  await findOwnedDiscipline(req.userId, id);

  const assessment = await prisma.$transaction(async (tx) => {
    const existing = await tx.assessment.findMany({ where: { disciplineId: id }, select: { weight: true } });
    const current = weightSum(existing.map((a) => ({ weight: a.weight, score: null })));
    if (exceedsWeightLimit(current, input.weight)) {
      throw weightError(current);
    }
    return tx.assessment.create({ data: { ...input, disciplineId: id } });
  });
  res.status(201).json(assessment);
});

export function weightError(current: number): HttpError {
  const formatted = current.toLocaleString('pt-PT', { maximumFractionDigits: 2 });
  return validationError([
    { path: 'weight', message: `A soma dos pesos não pode exceder 100% (atual: ${formatted}%)` },
  ]);
}
