// Ações sobre sessões planeadas (spec §11.6): concluir, falhar, mover/fixar, retirar.
// Nota: o spec sugere /api/study-sessions/:id/complete, mas /api/study-sessions já regista o foco real;
// as sessões planeadas ficam em /api/planned-sessions (documentado em docs/API.md).
import { Router } from 'express';
import { idParamSchema, overlaps, plannedSessionCompleteSchema, plannedSessionUpdateSchema } from '@studentos/shared';
import { blockOccurrences } from '../lib/calendar.js';
import { HttpError, notFound, parse } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

export const plannedSessionsRouter = Router();

const include = {
  task: { select: { id: true, title: true, status: true } },
  assessment: { select: { id: true, name: true, date: true } },
  discipline: { select: { id: true, name: true, code: true, color: true } },
} as const;

async function findOwned(userId: number, id: number) {
  const session = await prisma.plannedSession.findFirst({ where: { id, userId } });
  if (!session || session.status === 'CANCELLED') throw notFound('PLANNED_SESSION_NOT_FOUND', 'Sessão não encontrada');
  return session;
}

// PATCH — mover (fica fixada: o replaneamento respeita alterações manuais) ou fixar/desafixar
plannedSessionsRouter.patch('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const input = parse(plannedSessionUpdateSchema, req.body);
  const session = await findOwned(req.userId, id);
  if (session.status !== 'PLANNED') {
    throw new HttpError(409, 'SESSION_NOT_EDITABLE', 'Só é possível alterar sessões ainda planeadas');
  }

  let times: { startAt: Date; endAt: Date; plannedMinutes: number } | null = null;
  if (input.startAt && input.endAt) {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    if (startAt < new Date()) throw new HttpError(400, 'IN_THE_PAST', 'Não é possível mover uma sessão para o passado');
    if (minutes > 240) throw new HttpError(400, 'TOO_LONG', 'Uma sessão não pode ter mais de 4 horas');

    const [blocks, others] = await Promise.all([
      blockOccurrences(req.userId, startAt, endAt),
      prisma.plannedSession.findMany({
        where: {
          userId: req.userId,
          id: { not: id },
          status: { in: ['PLANNED', 'COMPLETED'] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      }),
    ]);
    const interval = { start: startAt, end: endAt };
    if (blocks.some((b) => b.isBusy && overlaps({ start: b.start, end: b.end }, interval))) {
      throw new HttpError(409, 'CONFLICT_BUSY', 'Esse horário coincide com uma aula ou evento ocupado');
    }
    if (others.length > 0)
      throw new HttpError(409, 'CONFLICT_SESSION', 'Esse horário coincide com outra sessão de estudo');
    times = { startAt, endAt, plannedMinutes: minutes };
  }

  const updated = await prisma.plannedSession.update({
    where: { id },
    data: {
      ...(times ? { ...times, pinned: true } : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    },
    include,
  });
  res.json(updated);
});

// Concluir: regista a duração real; não conclui a tarefa associada (spec §7.6).
plannedSessionsRouter.post('/:id/complete', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { actualMinutes } = parse(plannedSessionCompleteSchema, req.body ?? {});
  const session = await findOwned(req.userId, id);
  if (session.status === 'COMPLETED') throw new HttpError(409, 'ALREADY_COMPLETED', 'Esta sessão já foi concluída');
  if (session.startAt > new Date()) {
    throw new HttpError(409, 'NOT_STARTED', 'Só podes concluir uma sessão depois de ela começar');
  }
  const updated = await prisma.plannedSession.update({
    where: { id },
    data: { status: 'COMPLETED', actualMinutes: actualMinutes ?? session.plannedMinutes, completedAt: new Date() },
    include,
  });
  res.json(updated);
});

// Falhada: fica no histórico e o cliente pode pedir um replaneamento (spec §11.8).
plannedSessionsRouter.post('/:id/miss', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const session = await findOwned(req.userId, id);
  if (session.status !== 'PLANNED') {
    throw new HttpError(409, 'SESSION_NOT_EDITABLE', 'Só é possível marcar como falhada uma sessão planeada');
  }
  if (session.startAt > new Date()) {
    throw new HttpError(409, 'NOT_STARTED', 'Esta sessão ainda não começou: se não a vais fazer, retira-a do plano');
  }
  const updated = await prisma.plannedSession.update({
    where: { id },
    data: { status: 'MISSED', pinned: false },
    include,
  });
  res.json({ session: updated, replanSuggested: true });
});

// Retirar uma sessão planeada (as concluídas ficam no histórico).
plannedSessionsRouter.delete('/:id', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const session = await findOwned(req.userId, id);
  if (session.status === 'COMPLETED') {
    throw new HttpError(409, 'SESSION_NOT_EDITABLE', 'Sessões concluídas não podem ser retiradas');
  }
  await prisma.plannedSession.update({ where: { id }, data: { status: 'CANCELLED' } });
  res.status(204).end();
});
