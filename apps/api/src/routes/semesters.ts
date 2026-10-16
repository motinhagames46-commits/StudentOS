import { Router } from 'express';
import { idParamSchema, semesterCreateSchema, semesterUpdateSchema } from '@studentos/shared';
import { parse, validationError } from '../lib/http.js';
import { findOwnedSemester } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';

export const semestersRouter = Router();

semestersRouter.get('/', async (req, res) => {
  const semesters = await prisma.semester.findMany({
    where: { userId: req.userId },
    orderBy: { startDate: 'desc' },
  });
  res.json(semesters);
});

semestersRouter.post('/', async (req, res) => {
  const input = parse(semesterCreateSchema, req.body);
  const semester = await prisma.$transaction(async (tx) => {
    if (input.isActive) {
      await tx.semester.updateMany({ where: { userId: req.userId }, data: { isActive: false } });
    }
    return tx.semester.create({ data: { ...input, userId: req.userId } });
  });
  res.status(201).json(semester);
});

semestersRouter.patch('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const input = parse(semesterUpdateSchema, req.body);
  const current = await findOwnedSemester(req.userId, id);
  const startDate = input.startDate ? new Date(input.startDate) : current.startDate;
  const endDate = input.endDate ? new Date(input.endDate) : current.endDate;
  if (endDate <= startDate) {
    throw validationError([{ path: 'endDate', message: 'A data de fim tem de ser posterior à de início' }]);
  }
  const semester = await prisma.$transaction(async (tx) => {
    if (input.isActive) {
      await tx.semester.updateMany({ where: { userId: req.userId }, data: { isActive: false } });
    }
    return tx.semester.update({ where: { id }, data: input });
  });
  res.json(semester);
});

semestersRouter.delete('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedSemester(req.userId, id);
  await prisma.semester.delete({ where: { id } });
  res.status(204).end();
});
