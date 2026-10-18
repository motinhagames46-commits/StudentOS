// Ocorrências de aulas/eventos num intervalo, com deteção de conflitos (spec §7.5).
import { prisma } from './prisma.js';
import { expandOccurrences } from './recurrence.js';

const disciplineSelect = { select: { id: true, name: true, code: true, color: true } } as const;

export interface BlockOccurrence {
  id: string;
  blockId: number;
  title: string;
  kind: 'CLASS' | 'EVENT' | 'OTHER';
  start: Date;
  end: Date;
  allDay: boolean;
  isBusy: boolean;
  location: string | null;
  origin: 'MANUAL' | 'IMPORT_ICS' | 'IMPORT_CSV';
  sourceLabel: string | null;
  recurring: boolean;
  discipline: { id: number; name: string; code: string; color: string | null } | null;
  conflict: boolean;
}

export async function blockOccurrences(userId: number, from: Date, to: Date): Promise<BlockOccurrence[]> {
  const blocks = await prisma.scheduleBlock.findMany({
    where: {
      userId,
      startAt: { lt: to },
      OR: [
        { recurrenceRule: null, endAt: { gt: from } },
        { recurrenceRule: { not: null }, OR: [{ seriesEndAt: null }, { seriesEndAt: { gt: from } }] },
      ],
    },
    include: { discipline: disciplineSelect },
  });

  const occurrences: BlockOccurrence[] = blocks.flatMap((b) =>
    expandOccurrences(b, from, to).map((o) => ({
      id: `${b.id}:${o.start.toISOString()}`,
      blockId: b.id,
      title: b.title,
      kind: b.kind,
      start: o.start,
      end: o.end,
      allDay: b.allDay,
      isBusy: b.isBusy,
      location: b.location,
      origin: b.origin,
      sourceLabel: b.sourceLabel,
      recurring: b.recurrenceRule !== null,
      discipline: b.discipline,
      conflict: false,
    })),
  );
  occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
  markConflicts(occurrences.filter((o) => o.isBusy && !o.allDay));
  return occurrences;
}

/** Marca ocorrências ocupadas que se sobrepõem a outra ocorrência ocupada (lista ordenada por início). */
function markConflicts(sorted: BlockOccurrence[]): void {
  let active: BlockOccurrence | null = null;
  for (const occ of sorted) {
    if (active && occ.start < active.end) {
      occ.conflict = true;
      active.conflict = true;
      if (occ.end > active.end) active = occ;
    } else {
      active = occ;
    }
  }
}
