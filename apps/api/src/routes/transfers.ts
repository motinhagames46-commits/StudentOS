// Transferir disciplinas para outra conta do mesmo estudante (por exemplo, para outro email).
// A conta de origem gera um código de uso único (válido 30 minutos; só o hash é guardado). Com sessão
// iniciada na conta de destino, o estudante vê a pré-visualização e confirma. As avaliações acompanham as
// disciplinas; tarefas, aulas, sessões planeadas e sessões de estudo ligadas a elas mudam de conta.
import { createHash, randomInt } from 'node:crypto';
import { Router } from 'express';
import { transferCodeSchema, transferCreateSchema } from '@studentos/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError, notFound, parse } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

export const transfersRouter = Router();

const TTL_MS = 30 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, para ler e escrever sem enganos

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (code: string) => createHash('sha256').update(normalize(code)).digest('hex');

function newCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// POST /api/transfers — gera o código na conta de origem.
transfersRouter.post('/', async (req, res) => {
  const { disciplineIds, includeUnlinkedBlocks = false } = parse(transferCreateSchema, req.body);
  const disciplines = await prisma.discipline.findMany({
    where: { id: { in: disciplineIds }, userId: req.userId },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (disciplines.length !== disciplineIds.length) throw notFound('DISCIPLINE_NOT_FOUND', 'Disciplina não encontrada');

  const code = newCode();
  const transfer = await prisma.disciplineTransfer.create({
    data: {
      codeHash: hashCode(code),
      disciplineIds,
      includeUnlinkedBlocks,
      expiresAt: new Date(Date.now() + TTL_MS),
      fromUserId: req.userId,
    },
  });
  res.status(201).json({ code, expiresAt: transfer.expiresAt, disciplines });
});

type Db = Prisma.TransactionClient | typeof prisma;

/** Código válido, por usar, de outra conta. */
async function findUsable(db: Db, code: string, userId: number) {
  const transfer = await db.disciplineTransfer.findUnique({ where: { codeHash: hashCode(code) } });
  if (!transfer || transfer.usedAt || transfer.expiresAt <= new Date()) {
    throw notFound('TRANSFER_NOT_FOUND', 'Código inválido, já usado ou expirado. Gera um novo na conta de origem.');
  }
  if (transfer.fromUserId === userId) {
    throw new HttpError(
      409,
      'TRANSFER_SAME_ACCOUNT',
      'Este código é desta conta. Entra na conta de destino para o usar.',
    );
  }
  return transfer;
}

/** Tudo o que muda de conta, os conflitos e os duplicados, sem gravar nada. */
async function plan(
  db: Db,
  transfer: { fromUserId: number; disciplineIds: number[]; includeUnlinkedBlocks: boolean },
  toUserId: number,
) {
  const from = transfer.fromUserId;
  const ids = transfer.disciplineIds;
  const disciplines = await db.discipline.findMany({
    where: { id: { in: ids }, userId: from },
    include: { semester: true, _count: { select: { assessments: true } } },
    orderBy: { name: 'asc' },
  });
  const movingIds = disciplines.map((d) => d.id);
  const [targetSemesters, targetDisciplines, tasks, blocks] = await Promise.all([
    db.semester.findMany({ where: { userId: toUserId } }),
    db.discipline.findMany({ where: { userId: toUserId }, select: { code: true, semesterId: true } }),
    db.task.findMany({ where: { userId: from, disciplineId: { in: movingIds } } }),
    db.scheduleBlock.findMany({
      where: {
        userId: from,
        OR: [
          { disciplineId: { in: movingIds } },
          ...(transfer.includeUnlinkedBlocks ? [{ disciplineId: null, kind: 'CLASS' as const }] : []),
        ],
      },
    }),
  ]);

  // Semestre de destino com o mesmo nome (criado no registo), ou um novo com as mesmas datas.
  const semesterFor = (d: (typeof disciplines)[number]) =>
    d.semester ? (targetSemesters.find((s) => s.label === d.semester!.label) ?? null) : null;
  const conflicts = disciplines.filter((d) => {
    const target = semesterFor(d);
    if (d.semester && !target) return false; // semestre novo na conta de destino: sem conflito possível
    return targetDisciplines.some((t) => t.code === d.code && t.semesterId === (target?.id ?? null));
  });

  // Itens importados que a conta de destino já tem (mesma origem e identificador): não se duplicam.
  const external = async (model: 'task' | 'scheduleBlock', items: { origin: string; externalId: string | null }[]) => {
    const keys = items.filter((i) => i.externalId).map((i) => i.externalId!);
    if (!keys.length) return new Set<string>();
    const found =
      model === 'task'
        ? await db.task.findMany({
            where: { userId: toUserId, externalId: { in: keys } },
            select: { origin: true, externalId: true },
          })
        : await db.scheduleBlock.findMany({
            where: { userId: toUserId, externalId: { in: keys } },
            select: { origin: true, externalId: true },
          });
    return new Set(found.map((f) => `${f.origin}:${f.externalId}`));
  };
  const [taskDupes, blockDupes] = await Promise.all([external('task', tasks), external('scheduleBlock', blocks)]);
  const movingTasks = tasks.filter((t) => !taskDupes.has(`${t.origin}:${t.externalId}`));
  const movingBlocks = blocks.filter((b) => !blockDupes.has(`${b.origin}:${b.externalId}`));

  const movingTaskIds = movingTasks.map((t) => t.id);
  const plannedSessions = await db.plannedSession.findMany({
    where: {
      userId: from,
      OR: [
        { disciplineId: { in: movingIds } },
        { taskId: { in: movingTaskIds } },
        { assessment: { disciplineId: { in: movingIds } } },
      ],
    },
    select: { id: true },
  });
  const plannedIds = plannedSessions.map((p) => p.id);
  const studySessions = await db.studySession.findMany({
    where: { userId: from, OR: [{ disciplineId: { in: movingIds } }, { plannedSessionId: { in: plannedIds } }] },
    select: { id: true },
  });

  return {
    disciplines,
    semesterFor,
    conflicts,
    movingTaskIds,
    movingBlockIds: movingBlocks.map((b) => b.id),
    plannedIds,
    studySessionIds: studySessions.map((s) => s.id),
    counts: {
      disciplines: disciplines.length,
      assessments: disciplines.reduce((sum, d) => sum + d._count.assessments, 0),
      tasks: movingTasks.length,
      classes: movingBlocks.length,
      plannedSessions: plannedIds.length,
      studySessions: studySessions.length,
    },
    duplicates: { tasks: tasks.length - movingTasks.length, classes: blocks.length - movingBlocks.length },
  };
}

const conflictMessage = (codes: string[]) =>
  `Já tens ${codes.length === 1 ? 'a disciplina' : 'as disciplinas'} ${codes.join(', ')} no mesmo semestre nesta conta. ` +
  'Elimina-as ou arquiva-as aqui antes de transferir.';

// POST /api/transfers/preview — o que vai ser transferido, na conta de destino. Não grava nada.
transfersRouter.post('/preview', async (req, res) => {
  const { code } = parse(transferCodeSchema, req.body);
  const transfer = await findUsable(prisma, code, req.userId);
  const p = await plan(prisma, transfer, req.userId);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: transfer.fromUserId }, select: { name: true } });
  res.json({
    from: { name: owner.name },
    expiresAt: transfer.expiresAt,
    disciplines: p.disciplines.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      semester: d.semester?.label ?? null,
      assessments: d._count.assessments,
    })),
    counts: p.counts,
    duplicates: p.duplicates,
    conflicts: p.conflicts.map((d) => d.code),
    conflictMessage: p.conflicts.length ? conflictMessage(p.conflicts.map((d) => d.code)) : null,
  });
});

// POST /api/transfers/accept — transfere numa transação e gasta o código.
transfersRouter.post('/accept', async (req, res) => {
  const { code } = parse(transferCodeSchema, req.body);
  const to = req.userId;
  const result = await prisma.$transaction(async (tx) => {
    const transfer = await findUsable(tx, code, to);
    const p = await plan(tx, transfer, to);
    if (p.conflicts.length) {
      throw new HttpError(409, 'TRANSFER_CONFLICT', conflictMessage(p.conflicts.map((d) => d.code)));
    }
    const used = await tx.disciplineTransfer.updateMany({
      where: { id: transfer.id, usedAt: null },
      data: { usedAt: new Date(), toUserId: to },
    });
    if (used.count === 0) throw notFound('TRANSFER_NOT_FOUND', 'Este código já foi usado.');

    const hasActive = await tx.semester.count({ where: { userId: to, isActive: true } });
    const created = new Map<number, number>();
    for (const d of p.disciplines) {
      let semesterId = p.semesterFor(d)?.id ?? null;
      if (d.semester && semesterId === null) {
        semesterId = created.get(d.semester.id) ?? null;
        if (semesterId === null) {
          const s = await tx.semester.create({
            data: {
              userId: to,
              label: d.semester.label,
              startDate: d.semester.startDate,
              endDate: d.semester.endDate,
              isActive: hasActive === 0 && created.size === 0,
            },
          });
          created.set(d.semester.id, s.id);
          semesterId = s.id;
        }
      }
      await tx.discipline.update({ where: { id: d.id }, data: { userId: to, semesterId } });
    }
    // Ligações a dados que ficam na conta de origem (importações, propostas) deixam de existir.
    await tx.task.updateMany({ where: { id: { in: p.movingTaskIds } }, data: { userId: to, importJobId: null } });
    await tx.scheduleBlock.updateMany({
      where: { id: { in: p.movingBlockIds } },
      data: { userId: to, importJobId: null },
    });
    await tx.plannedSession.updateMany({ where: { id: { in: p.plannedIds } }, data: { userId: to, planId: null } });
    await tx.studySession.updateMany({ where: { id: { in: p.studySessionIds } }, data: { userId: to } });
    await tx.studySession.updateMany({
      where: { id: { in: p.studySessionIds }, plannedSessionId: { notIn: p.plannedIds } },
      data: { plannedSessionId: null },
    });
    return { counts: p.counts, duplicates: p.duplicates };
  });
  res.json(result);
});
