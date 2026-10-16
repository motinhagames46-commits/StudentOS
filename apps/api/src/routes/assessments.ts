import { Router } from 'express';
import { assessmentUpdateSchema, exceedsWeightLimit, idParamSchema, weightSum } from '@studentos/shared';
import { parse } from '../lib/http.js';
import { findOwnedAssessment } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';
import { weightError } from './disciplines.js';

export const assessmentsRouter = Router();

assessmentsRouter.patch('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const input = parse(assessmentUpdateSchema, req.body);
  const assessment = await findOwnedAssessment(req.userId, id);

  const updated = await prisma.$transaction(async (tx) => {
    if (input.weight !== undefined) {
      const others = await tx.assessment.findMany({
        where: { disciplineId: assessment.disciplineId, id: { not: id } },
        select: { weight: true },
      });
      const current = weightSum(others.map((a) => ({ weight: a.weight, score: null })));
      if (exceedsWeightLimit(current, input.weight)) throw weightError(current);
    }
    return tx.assessment.update({ where: { id }, data: input });
  });
  res.json(updated);
});

assessmentsRouter.delete('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  await findOwnedAssessment(req.userId, id);
  await prisma.assessment.delete({ where: { id } });
  res.status(204).end();
});
