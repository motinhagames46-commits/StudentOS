import { Router } from 'express';
import {
  idParamSchema,
  studySessionQuerySchema,
  studySessionStartSchema,
  studySessionStopSchema,
} from '@studentos/shared';
import { HttpError, parse } from '../lib/http.js';
import { findOwnedDiscipline, findOwnedStudySession } from '../lib/ownership.js';
import { prisma } from '../lib/prisma.js';

export const studySessionsRouter = Router();

const disciplineSelect = { select: { id: true, name: true, code: true, color: true } } as const;

// RF13 — lista as sessões que se sobrepõem ao intervalo [from, to]; uma sessão em curso conta até agora.
studySessionsRouter.get('/', async (req, res) => {
  const { from, to } = parse(studySessionQuerySchema, req.query);
  const sessions = await prisma.studySession.findMany({
    where: {
      userId: req.userId,
      ...(to ? { startedAt: { lte: to } } : {}),
      ...(from ? { OR: [{ endedAt: null }, { endedAt: { gte: from } }] } : {}),
    },
    include: { discipline: disciplineSelect },
    orderBy: { startedAt: 'desc' },
  });
  res.json(sessions);
});

// RN11 — no máximo uma sessão em curso por utilizador. O bloqueio da linha do utilizador
// serializa pedidos simultâneos, para que dois "iniciar" em paralelo não criem duas sessões.
studySessionsRouter.post('/start', async (req, res) => {
  const input = parse(studySessionStartSchema, req.body ?? {});
  let disciplineId = input.disciplineId ?? null;
  let plannedSessionId: number | null = null;
  if (input.plannedSessionId) {
    // Foco iniciado a partir do plano: a disciplina vem da sessão planeada (que tem de ser do utilizador).
    const planned = await prisma.plannedSession.findFirst({
      where: { id: input.plannedSessionId, userId: req.userId, status: 'PLANNED' },
    });
    if (!planned) throw new HttpError(404, 'PLANNED_SESSION_NOT_FOUND', 'Sessão planeada não encontrada');
    plannedSessionId = planned.id;
    disciplineId = disciplineId ?? planned.disciplineId;
  }
  if (disciplineId) await findOwnedDiscipline(req.userId, disciplineId);

  const session = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${req.userId} FOR UPDATE`;
    const running = await tx.studySession.findFirst({ where: { userId: req.userId, endedAt: null } });
    if (running) {
      throw new HttpError(409, 'STUDY_SESSION_IN_PROGRESS', 'Já tens uma sessão de estudo em curso');
    }
    return tx.studySession.create({
      data: { startedAt: new Date(), disciplineId, plannedSessionId, userId: req.userId },
      include: { discipline: disciplineSelect },
    });
  });
  res.status(201).json(session);
});

studySessionsRouter.post('/:id/stop', async (req, res) => {
  const id = parse(idParamSchema, req.params.id);
  const { notes } = parse(studySessionStopSchema, req.body ?? {});
  const current = await findOwnedStudySession(req.userId, id);
  if (current.endedAt) {
    throw new HttpError(409, 'STUDY_SESSION_ALREADY_STOPPED', 'Esta sessão de estudo já terminou');
  }

  // endedAt > startedAt (secção 10.1)
  const endedAt = new Date(Math.max(Date.now(), current.startedAt.getTime() + 1));
  const session = await prisma.studySession.update({
    where: { id },
    data: { endedAt, ...(notes !== undefined ? { notes } : {}) },
    include: { discipline: disciplineSelect },
  });
  res.json(session);
});
