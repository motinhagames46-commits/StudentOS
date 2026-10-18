// Deteção de duplicados e ação por omissão de cada item (spec §8.5).
import { createHash } from 'node:crypto';
import type { ImportItem } from '@studentos/shared';
import { prisma } from '../prisma.js';
import type { RawImportItem } from './types.js';

type ImportOrigin = 'IMPORT_ICS' | 'IMPORT_CSV';

const normalizeTitle = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

/** Impressão digital determinística (não infalível): título normalizado + início + fim + regra. */
export function fingerprintOf(item: {
  title: string;
  startAt: string | Date | null;
  endAt: string | Date | null;
  recurrenceRule?: string | null;
}): string {
  const iso = (d: string | Date | null) => (d ? new Date(d).toISOString() : '');
  return createHash('sha256')
    .update([normalizeTitle(item.title), iso(item.startAt), iso(item.endAt), item.recurrenceRule ?? ''].join('|'))
    .digest('hex');
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  }).format(d);

export async function reviewItems(userId: number, raw: RawImportItem[], origin: ImportOrigin): Promise<ImportItem[]> {
  const disciplines = await prisma.discipline.findMany({
    where: { userId },
    select: { id: true, code: true, name: true },
  });
  const matchDiscipline = (label: string | null) => {
    if (!label) return null;
    const n = label.trim().toLowerCase();
    return disciplines.find((d) => d.code.toLowerCase() === n || d.name.toLowerCase() === n)?.id ?? null;
  };

  const externalIds = raw.map((r) => r.externalId).filter((x): x is string => !!x);
  const fingerprints = raw.map((r) => fingerprintOf(r));
  const [existingBlocks, existingTasks, sameFingerprint] = await Promise.all([
    externalIds.length
      ? prisma.scheduleBlock.findMany({
          where: { userId, origin, externalId: { in: externalIds } },
          select: { id: true, externalId: true, title: true, startAt: true },
        })
      : [],
    externalIds.length
      ? prisma.task.findMany({
          where: { userId, origin, externalId: { in: externalIds } },
          select: { id: true, externalId: true, title: true, dueDate: true },
        })
      : [],
    prisma.scheduleBlock.findMany({
      where: { userId, fingerprint: { in: fingerprints } },
      select: { id: true, fingerprint: true, title: true, startAt: true },
    }),
  ]);

  const seenInFile = new Set<string>();
  return raw.map((item, index) => {
    const fingerprint = fingerprints[index]!;
    const disciplineId = item.disciplineId ?? matchDiscipline(item.disciplineLabel);
    let duplicate: ImportItem['duplicate'] = null;

    const sameExternal =
      item.target === 'task'
        ? existingTasks.find((t) => t.externalId === item.externalId)
        : existingBlocks.find((b) => b.externalId === item.externalId);
    if (item.externalId && sameExternal) {
      const when = 'startAt' in sameExternal ? sameExternal.startAt : sameExternal.dueDate;
      duplicate = {
        reason: 'external',
        existingId: sameExternal.id,
        label: `Já importado: «${sameExternal.title}»${when ? ` (${fmt(when)})` : ''}`,
      };
    } else if (item.target === 'block') {
      const same = sameFingerprint.find((b) => b.fingerprint === fingerprint);
      if (same) {
        duplicate = {
          reason: 'fingerprint',
          existingId: same.id,
          label: `Possível duplicado de «${same.title}» (${fmt(same.startAt)})`,
        };
      } else if (seenInFile.has(fingerprint)) {
        duplicate = { reason: 'file', existingId: null, label: 'Repetido neste ficheiro' };
      }
    }
    seenInFile.add(fingerprint);

    const hasError = item.issues.some((i) => i.severity === 'error');
    return {
      ...item,
      key: String(index + 1),
      disciplineId,
      duplicate,
      action: hasError || duplicate ? 'skip' : 'create',
    };
  });
}
