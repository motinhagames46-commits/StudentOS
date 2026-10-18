// Motor determinístico de planeamento de estudo (spec §11).
// Função pura: o mesmo input produz sempre o mesmo plano. Não usa IA nem acede à base de dados.
//
// Restrições garantidas (spec §11.3): nunca agenda sobre eventos ocupados nem sobre sessões
// protegidas (concluídas, fixadas, a decorrer); nunca no passado; nunca sobrepõe sessões; respeita as
// janelas de disponibilidade e o limite diário; não termina sessões depois do prazo do item; não cria
// sessões infinitas — o trabalho que não cabe é reportado como "não planeado".
import { addDaysToKey, instantToZoned, weekdayOfKey, zonedDayKey, zonedToInstant } from './timezone.js';

export interface PlannerPreferences {
  sessionMinutes: number;
  minSessionMinutes: number;
  breakMinutes: number;
  maxDailyMinutes: number;
}

export const DEFAULT_PLANNER_PREFERENCES: PlannerPreferences = {
  sessionMinutes: 50,
  minSessionMinutes: 25,
  breakMinutes: 10,
  maxDailyMinutes: 180,
};

export interface AvailabilityWindow {
  weekday: number; // 1 = segunda … 7 = domingo
  startMinute: number;
  endMinute: number;
}

export interface Interval {
  start: Date;
  end: Date;
}

export type WorkRefType = 'task' | 'assessment';

export interface WorkItem {
  type: WorkRefType;
  id: number;
  title: string;
  disciplineId: number | null;
  disciplineCode: string | null;
  /** Prazo da tarefa ou data da avaliação. */
  deadline: Date | null;
  /** Minutos de trabalho ainda por planear; null = sem estimativa. */
  remainingMinutes: number | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Ponderação da avaliação na nota (%), quando conhecida. */
  weightPercent: number | null;
  /** Sessões anteriormente falhadas para este item. */
  missedCount: number;
  /** "tarefa", "teste", "exame", "trabalho"… (para as explicações). */
  label: string;
}

export interface PlannerInput {
  now: Date;
  from: Date;
  to: Date;
  timeZone: string;
  availability: AvailabilityWindow[];
  /** Aulas/eventos ocupados e sessões protegidas. */
  busy: Interval[];
  /** Minutos já ocupados por sessões protegidas em cada dia (aaaa-mm-dd), para o limite diário. */
  protectedMinutesByDay: Record<string, number>;
  items: WorkItem[];
  preferences: PlannerPreferences;
}

export interface ProposedSession {
  start: string;
  end: string;
  minutes: number;
  type: WorkRefType;
  itemId: number;
  title: string;
  disciplineId: number | null;
  reason: string;
}

export type UnplannedReason = 'NO_ESTIMATE' | 'NO_SPACE' | 'PAST_DEADLINE' | 'BEYOND_HORIZON';

export interface UnplannedItem {
  type: WorkRefType;
  itemId: number;
  title: string;
  reason: UnplannedReason;
  missingMinutes: number | null;
  message: string;
}

export interface PlanResult {
  sessions: ProposedSession[];
  unplanned: UnplannedItem[];
  warnings: string[];
  rules: { weights: typeof PRIORITY_WEIGHTS; preferences: PlannerPreferences; timeZone: string };
}

/** Pesos do cálculo de prioridade (somam 1). Cada fator está normalizado em [0, 1]. */
export const PRIORITY_WEIGHTS = {
  deadline: 0.35,
  declaredPriority: 0.2,
  assessmentWeight: 0.15,
  workload: 0.15,
  missed: 0.1,
  overdue: 0.05,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const GRID_MINUTES = 5;
/** Máximo de sessões do mesmo item por dia (distribui o trabalho), exceto perto do prazo. */
const MAX_SESSIONS_PER_ITEM_PER_DAY = 2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface PriorityBreakdown {
  score: number;
  factors: Record<keyof typeof PRIORITY_WEIGHTS, number>;
  daysUntilDeadline: number | null;
}

/** Prioridade determinística e explicável de um item (spec §11.4). */
export function priorityOf(item: WorkItem, now: Date): PriorityBreakdown {
  const days = item.deadline ? (item.deadline.getTime() - now.getTime()) / DAY_MS : null;
  const declared = item.priority === 'HIGH' ? 1 : item.priority === 'MEDIUM' ? 0.5 : 0.2;
  const factors = {
    deadline: days === null ? 0.1 : clamp01(1 - days / 14),
    declaredPriority: declared,
    assessmentWeight: item.weightPercent === null ? 0 : clamp01(item.weightPercent / 100),
    workload: clamp01((item.remainingMinutes ?? 0) / 300),
    missed: clamp01(item.missedCount / 3),
    overdue: days !== null && days < 0 ? 1 : 0,
  };
  const score = (Object.keys(PRIORITY_WEIGHTS) as (keyof typeof PRIORITY_WEIGHTS)[]).reduce(
    (sum, k) => sum + PRIORITY_WEIGHTS[k] * factors[k],
    0,
  );
  return { score: Math.round(score * 1000) / 1000, factors, daysUntilDeadline: days };
}

function relativeDays(days: number): string {
  const d = Math.floor(days);
  if (days < 0) return `o prazo passou há ${Math.max(1, Math.ceil(-days))} dia(s)`;
  if (d === 0) return 'é hoje';
  if (d === 1) return 'é amanhã';
  return `é daqui a ${d} dias`;
}

/** Explicação legível, só com números que existem no sistema (spec §11.4). */
export function explain(item: WorkItem, p: PriorityBreakdown): string {
  const level = p.score >= 0.6 ? 'Prioridade alta' : p.score >= 0.35 ? 'Prioridade média' : 'Prioridade baixa';
  const what = `${item.label} «${item.title}»${item.disciplineCode ? ` (${item.disciplineCode})` : ''}`;
  const parts: string[] = [];
  if (p.daysUntilDeadline !== null) parts.push(`${what} ${relativeDays(p.daysUntilDeadline)}`);
  else parts.push(`${what} sem prazo definido`);
  if (item.weightPercent !== null) parts.push(`vale ${item.weightPercent}% da nota`);
  if (item.remainingMinutes !== null) parts.push(`faltam cerca de ${item.remainingMinutes} min`);
  if (item.missedCount > 0) parts.push(`${item.missedCount} sessão(ões) falhada(s)`);
  return `${level}: ${parts.join('; ')}.`;
}

interface Slot {
  dayKey: string;
  start: number; // ms
  end: number; // ms
}

/** Janelas livres: disponibilidade (hora local) menos ocupado, sem passado. */
function freeSlots(input: PlannerInput): Slot[] {
  const earliest =
    Math.ceil(Math.max(input.now.getTime(), input.from.getTime()) / (GRID_MINUTES * MIN_MS)) * GRID_MINUTES * MIN_MS;
  const busy = [...input.busy]
    .map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }))
    .sort((a, b) => a.start - b.start);
  const slots: Slot[] = [];

  for (let key = zonedDayKey(input.from, input.timeZone); ; key = addDaysToKey(key, 1)) {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    const dayStart = zonedToInstant(y, m, d, 0, 0, input.timeZone).getTime();
    if (dayStart >= input.to.getTime()) break;
    const weekday = weekdayOfKey(key);
    const windows = input.availability
      .filter((w) => w.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute);

    for (const w of windows) {
      const ws = zonedToInstant(y, m, d, Math.floor(w.startMinute / 60), w.startMinute % 60, input.timeZone).getTime();
      const we =
        w.endMinute >= 1440
          ? zonedToInstant(...nextDay(y, m, d), 0, 0, input.timeZone).getTime()
          : zonedToInstant(y, m, d, Math.floor(w.endMinute / 60), w.endMinute % 60, input.timeZone).getTime();
      let segments: { start: number; end: number }[] = [
        { start: Math.max(ws, earliest), end: Math.min(we, input.to.getTime()) },
      ];
      for (const b of busy) {
        if (b.end <= ws || b.start >= we) continue;
        segments = segments.flatMap((s) => {
          if (b.end <= s.start || b.start >= s.end) return [s];
          const out = [];
          if (b.start > s.start) out.push({ start: s.start, end: b.start });
          if (b.end < s.end) out.push({ start: b.end, end: s.end });
          return out;
        });
      }
      for (const s of segments) if (s.end > s.start) slots.push({ dayKey: key, ...s });
    }
  }
  return slots.sort((a, b) => a.start - b.start);
}

function nextDay(y: number, m: number, d: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

const ceilToGrid = (ms: number) => Math.ceil(ms / (GRID_MINUTES * MIN_MS)) * GRID_MINUTES * MIN_MS;

export function planStudy(input: PlannerInput): PlanResult {
  const prefs = input.preferences;
  const warnings: string[] = [];
  const unplanned: UnplannedItem[] = [];
  const sessions: ProposedSession[] = [];

  if (input.availability.length === 0) {
    warnings.push('Não definiste disponibilidade para estudar: indica os dias e horas nas Preferências.');
  }

  // Itens elegíveis, com prioridade fixa calculada no momento da geração (determinística).
  type Work = { item: WorkItem; remaining: number; priority: PriorityBreakdown; reason: string };
  const work: Work[] = [];
  for (const item of input.items) {
    if (item.remainingMinutes === null) {
      unplanned.push({
        type: item.type,
        itemId: item.id,
        title: item.title,
        reason: 'NO_ESTIMATE',
        missingMinutes: null,
        message: `Indica a duração estimada de «${item.title}» para a poder planear.`,
      });
      continue;
    }
    if (item.remainingMinutes <= 0) continue;
    if (item.type === 'assessment' && item.deadline && item.deadline <= input.now) {
      unplanned.push({
        type: item.type,
        itemId: item.id,
        title: item.title,
        reason: 'PAST_DEADLINE',
        missingMinutes: item.remainingMinutes,
        message: `A avaliação «${item.title}» já passou.`,
      });
      continue;
    }
    const priority = priorityOf(item, input.now);
    work.push({ item, remaining: item.remainingMinutes, priority, reason: explain(item, priority) });
  }
  // Ordem estável: prioridade, depois prazo mais cedo, depois tipo e id.
  work.sort(
    (a, b) =>
      b.priority.score - a.priority.score ||
      (a.item.deadline?.getTime() ?? Infinity) - (b.item.deadline?.getTime() ?? Infinity) ||
      a.item.type.localeCompare(b.item.type) ||
      a.item.id - b.item.id,
  );

  const usedByDay: Record<string, number> = { ...input.protectedMinutesByDay };
  const perItemPerDay = new Map<string, number>();
  let lastDiscipline: number | null = null;
  const slots = freeSlots(input);
  // Fração útil de uma janela livre (descontando as pausas entre sessões).
  const efficiency = prefs.sessionMinutes / (prefs.sessionMinutes + prefs.breakMinutes);

  /** Minutos de estudo ainda possíveis entre dois instantes (janelas livres, pausas e limite diário). */
  const capacityBetween = (fromMs: number, toMs: number): number => {
    const perDay = new Map<string, number>();
    for (const s of slots) {
      const a = Math.max(s.start, fromMs);
      const b = Math.min(s.end, toMs);
      if (b > a) perDay.set(s.dayKey, (perDay.get(s.dayKey) ?? 0) + (b - a) / MIN_MS);
    }
    let total = 0;
    for (const [day, minutes] of perDay) {
      total += Math.min(minutes * efficiency, Math.max(0, prefs.maxDailyMinutes - (usedByDay[day] ?? 0)));
    }
    return total;
  };

  /** Teste EDF: todos os prazos futuros continuam cumpríveis a partir de `afterMs`? */
  const deadlinesFeasible = (afterMs: number): boolean => {
    const pending = work
      .filter((w) => w.remaining > 0 && w.item.deadline && w.item.deadline.getTime() > afterMs)
      .sort((a, b) => a.item.deadline!.getTime() - b.item.deadline!.getTime());
    let cumulative = 0;
    for (const w of pending) {
      cumulative += w.remaining;
      if (capacityBetween(afterMs, w.item.deadline!.getTime()) + 1e-6 < cumulative) return false;
    }
    return true;
  };

  for (const slot of slots) {
    let t = ceilToGrid(slot.start);
    while (t < slot.end) {
      const freeMinutes = Math.floor((slot.end - t) / MIN_MS);
      const budget = prefs.maxDailyMinutes - (usedByDay[slot.dayKey] ?? 0);
      const room = Math.min(freeMinutes, budget, prefs.sessionMinutes);
      if (room < Math.min(prefs.minSessionMinutes, 15)) break;

      const candidates = work.filter((w) => {
        if (w.remaining <= 0) return false;
        const length = Math.min(room, w.remaining);
        if (length < Math.min(prefs.minSessionMinutes, w.remaining)) return false;
        if (w.item.deadline && t + length * MIN_MS > w.item.deadline.getTime() && w.priority.factors.overdue === 0) {
          return false; // a sessão não pode acabar depois do prazo
        }
        const nearDeadline = w.item.deadline !== null && w.item.deadline.getTime() - t < 2 * DAY_MS;
        const count = perItemPerDay.get(`${w.item.type}:${w.item.id}:${slot.dayKey}`) ?? 0;
        return nearDeadline || count < MAX_SESSIONS_PER_ITEM_PER_DAY;
      });
      if (candidates.length === 0) break;

      // Alternar disciplinas quando a prioridade é comparável (≥ 85 % da melhor).
      const best = candidates[0]!;
      const alternative = candidates.find(
        (c) => c.item.disciplineId !== lastDiscipline && c.priority.score >= best.priority.score * 0.85,
      );
      const preferred: Work =
        lastDiscipline !== null && best.item.disciplineId === lastDiscipline && alternative ? alternative : best;

      // A prioridade decide, desde que não torne impossível um prazo mais próximo; se tornar,
      // passa à frente o prazo mais cedo (earliest deadline first, ótimo para a viabilidade).
      const wouldKeepDeadlines = (candidate: Work): boolean => {
        const length = Math.min(room, candidate.remaining);
        candidate.remaining -= length;
        usedByDay[slot.dayKey] = (usedByDay[slot.dayKey] ?? 0) + length;
        const ok = deadlinesFeasible(t + (length + prefs.breakMinutes) * MIN_MS);
        candidate.remaining += length;
        usedByDay[slot.dayKey] = (usedByDay[slot.dayKey] ?? 0) - length;
        return ok;
      };
      let chosen = preferred;
      if (!wouldKeepDeadlines(preferred)) {
        const earliest = candidates
          .filter((c) => c.item.deadline && c.item.deadline.getTime() > t)
          .sort(
            (a, b) => a.item.deadline!.getTime() - b.item.deadline!.getTime() || b.priority.score - a.priority.score,
          )[0];
        if (earliest) chosen = earliest;
      }

      const minutes = Math.min(room, chosen.remaining);
      const end = t + minutes * MIN_MS;
      sessions.push({
        start: new Date(t).toISOString(),
        end: new Date(end).toISOString(),
        minutes,
        type: chosen.item.type,
        itemId: chosen.item.id,
        title: chosen.item.title,
        disciplineId: chosen.item.disciplineId,
        reason: chosen.reason,
      });
      chosen.remaining -= minutes;
      usedByDay[slot.dayKey] = (usedByDay[slot.dayKey] ?? 0) + minutes;
      const key = `${chosen.item.type}:${chosen.item.id}:${slot.dayKey}`;
      perItemPerDay.set(key, (perItemPerDay.get(key) ?? 0) + 1);
      lastDiscipline = chosen.item.disciplineId;
      t = ceilToGrid(end + prefs.breakMinutes * MIN_MS);
    }
  }

  const shortDate = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', timeZone: input.timeZone });
  for (const w of work) {
    if (w.remaining <= 0) continue;
    const beyond = w.item.deadline === null || w.item.deadline.getTime() > input.to.getTime();
    unplanned.push({
      type: w.item.type,
      itemId: w.item.id,
      title: w.item.title,
      reason: beyond ? 'BEYOND_HORIZON' : 'NO_SPACE',
      missingMinutes: w.remaining,
      message: beyond
        ? `Faltam ${w.remaining} min de «${w.item.title}»: ficam para depois deste período${
            w.item.deadline ? ` (prazo a ${shortDate.format(w.item.deadline)})` : ''
          }.`
        : `Faltam ${w.remaining} min para «${w.item.title}» antes do prazo: não há espaço livre suficiente.`,
    });
  }
  if (unplanned.some((u) => u.reason === 'NO_SPACE')) {
    warnings.push(
      'Não há tempo suficiente para todo o trabalho. Podes aumentar a disponibilidade ou o limite diário, reduzir as estimativas, ou aceitar que algumas tarefas fiquem sem sessão.',
    );
  }

  return {
    sessions,
    unplanned,
    warnings,
    rules: { weights: PRIORITY_WEIGHTS, preferences: prefs, timeZone: input.timeZone },
  };
}

/** Minutos de cada dia (aaaa-mm-dd, hora local) ocupados por intervalos. */
export function minutesByDay(intervals: Interval[], timeZone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of intervals) {
    const key = zonedDayKey(i.start, timeZone);
    out[key] = (out[key] ?? 0) + Math.round((i.end.getTime() - i.start.getTime()) / MIN_MS);
  }
  return out;
}

/** Verdadeiro se dois intervalos se sobrepõem. */
export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Hora local hh:mm de um instante (para mensagens). */
export function localTime(date: Date, timeZone: string): string {
  const p = instantToZoned(date, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
