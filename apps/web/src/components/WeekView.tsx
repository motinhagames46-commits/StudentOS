import {
  DEFAULT_TIMEZONE,
  addDaysToKey,
  instantToZoned,
  startOfZonedDay,
  weekdayOfKey,
  zonedDayKey,
} from '@studentos/shared';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useCalendar } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { formatTime } from '../lib/format';
import type { BlockOccurrence, CalendarData } from '../lib/types';
import { Button, ErrorState, IconButton, Skeleton } from './ui';

const TZ = DEFAULT_TIMEZONE;
const HOUR_PX = 48;
const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Item posicionável na grelha horária (aula/evento, ou sessão de estudo planeada). */
export interface TimedItem {
  id: string;
  start: string;
  end: string;
  title: string;
  subtitle?: string;
  color: string | null;
  variant: 'class' | 'event' | 'free' | 'study';
  conflict?: boolean;
}

export function mondayOf(dayKey: string): string {
  return addDaysToKey(dayKey, 1 - weekdayOfKey(dayKey));
}

export function blockToTimedItem(b: BlockOccurrence): TimedItem {
  return {
    id: b.id,
    start: b.start,
    end: b.end,
    title: b.title,
    subtitle: b.location ?? undefined,
    color: b.discipline?.color ?? null,
    variant: !b.isBusy ? 'free' : b.kind === 'CLASS' ? 'class' : 'event',
    conflict: b.conflict,
  };
}

interface Positioned {
  item: TimedItem;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** Disposição em colunas de itens sobrepostos num dia. */
function layoutDay(items: TimedItem[], gridStartHour: number): Positioned[] {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const out: Positioned[] = [];
  let cluster: Positioned[] = [];
  let clusterEnd = '';
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    cluster.forEach((p) => (p.cols = cols));
    out.push(...cluster);
    cluster = [];
  };
  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush();
    const startP = instantToZoned(new Date(item.start), TZ);
    const endMs = new Date(item.end).getTime() - new Date(item.start).getTime();
    const startMin = startP.hour * 60 + startP.minute;
    const top = ((startMin - gridStartHour * 60) / 60) * HOUR_PX;
    const height = Math.max(22, (endMs / 3_600_000) * HOUR_PX);
    const used = new Set(cluster.filter((p) => p.item.end > item.start).map((p) => p.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ item, top, height, col, cols: 1 });
    if (item.end > clusterEnd) clusterEnd = item.end;
  }
  flush();
  return out;
}

const variantClass: Record<TimedItem['variant'], string> = {
  class: 'border-l-4 bg-stone-100 text-stone-900',
  event: 'border border-stone-300 bg-white text-stone-900',
  free: 'border border-dashed border-stone-300 bg-white/70 text-stone-600',
  study: 'border-l-4 border-accent bg-accent-soft text-accent-ink',
};

export function WeekView({
  extraItems = [],
  onSelect,
  selectedId,
  header,
}: {
  /** Itens adicionais (ex.: sessões de estudo planeadas). */
  extraItems?: TimedItem[];
  onSelect?: (id: string, data: CalendarData | undefined) => void;
  selectedId?: string | null;
  header?: ReactNode;
}) {
  const todayKey = zonedDayKey(new Date(), TZ);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayKey));
  const [mobileDay, setMobileDay] = useState(todayKey);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i)), [weekStart]);
  const from = startOfZonedDay(weekStart, TZ).toISOString();
  const to = startOfZonedDay(addDaysToKey(weekStart, 7), TZ).toISOString();
  const { data, error, refetch, isPending } = useCalendar(from, to);

  const timed = useMemo(() => {
    const blocks = (data?.blocks ?? []).filter((b) => !b.allDay).map(blockToTimedItem);
    return [...blocks, ...extraItems];
  }, [data, extraItems]);

  const [gridStart, gridEnd] = useMemo(() => {
    let min = 8;
    let max = 20;
    for (const it of timed) {
      const s = instantToZoned(new Date(it.start), TZ);
      const e = instantToZoned(new Date(it.end), TZ);
      min = Math.min(min, s.hour);
      max = Math.max(max, e.minute > 0 ? e.hour + 1 : e.hour || 24);
    }
    return [Math.max(0, min), Math.min(24, max)];
  }, [timed]);

  const byDay = (key: string) => timed.filter((it) => zonedDayKey(new Date(it.start), TZ) === key);
  const deadlinesByDay = (key: string) => [
    ...(data?.tasks ?? [])
      .filter((t) => t.dueDate && zonedDayKey(new Date(t.dueDate), TZ) === key)
      .map((t) => ({
        id: `task:${t.id}`,
        label: t.title,
        kind: 'Prazo',
        done: t.status === 'DONE',
        color: t.discipline?.color ?? null,
      })),
    ...(data?.assessments ?? [])
      .filter((a) => a.date && zonedDayKey(new Date(a.date), TZ) === key)
      .map((a) => ({
        id: `assessment:${a.id}`,
        label: `${a.discipline.code} · ${a.name}`,
        kind: 'Avaliação',
        done: false,
        color: a.discipline.color,
      })),
    ...(data?.blocks ?? [])
      .filter((b) => b.allDay && zonedDayKey(new Date(b.start), TZ) === key)
      .map((b) => ({ id: b.id, label: b.title, kind: 'Dia inteiro', done: false, color: b.discipline?.color ?? null })),
  ];

  const monthLabel = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: TZ }).format(
    new Date(from),
  );
  const hours = Array.from({ length: gridEnd - gridStart }, (_, i) => gridStart + i);
  const shift = (weeks: number) => {
    setWeekStart((w) => addDaysToKey(w, weeks * 7));
    setMobileDay((d) => addDaysToKey(d, weeks * 7));
  };

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  const dayColumn = (key: string) => (
    <div key={key} className="relative border-l border-stone-100" style={{ height: hours.length * HOUR_PX }}>
      {hours.map((h) => (
        <div key={h} className="border-t border-stone-100" style={{ height: HOUR_PX }} />
      ))}
      {key === todayKey && <NowLine gridStart={gridStart} />}
      {layoutDay(byDay(key), gridStart).map(({ item, top, height, col, cols }) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item.id, data)}
          aria-label={`${item.title}, ${formatTime(item.start)}–${formatTime(item.end)}${item.conflict ? ', em conflito' : ''}`}
          className={`absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow ${variantClass[item.variant]} ${
            item.conflict ? 'ring-2 ring-red-400' : ''
          } ${selectedId === item.id ? 'z-10 ring-2 ring-accent' : ''}`}
          style={{
            top,
            height,
            left: `calc(${(col / cols) * 100}% + 2px)`,
            width: `calc(${100 / cols}% - 4px)`,
            borderLeftColor: item.variant === 'class' ? (item.color ?? '#a8a29e') : undefined,
          }}
        >
          <span className="flex items-center gap-1 font-medium">
            {item.conflict && <AlertTriangle aria-hidden="true" className="size-3 shrink-0 text-red-600" />}
            <span className="truncate">{item.title}</span>
          </span>
          <span className="block truncate text-stone-600">
            {formatTime(item.start)}–{formatTime(item.end)}
            {item.subtitle ? ` · ${item.subtitle}` : ''}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-stone-900 first-letter:uppercase">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          {header}
          <Button
            variant="ghost"
            onClick={() => {
              setWeekStart(mondayOf(todayKey));
              setMobileDay(todayKey);
            }}
          >
            Hoje
          </Button>
          <IconButton label="Semana anterior" onClick={() => shift(-1)}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton label="Semana seguinte" onClick={() => shift(1)}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          {/* Mobile: um dia de cada vez */}
          <div className="md:hidden">
            <div className="mb-2 grid grid-cols-7 gap-1" role="tablist" aria-label="Dia da semana">
              {days.map((key, i) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mobileDay === key}
                  onClick={() => setMobileDay(key)}
                  className={`rounded-lg py-1.5 text-center text-xs ${
                    mobileDay === key
                      ? 'bg-stone-900 text-white'
                      : key === todayKey
                        ? 'bg-accent-soft text-accent'
                        : 'text-stone-600'
                  }`}
                >
                  {WEEKDAY_SHORT[i]}
                  <span className="block text-sm font-semibold">{Number(key.slice(8))}</span>
                </button>
              ))}
            </div>
            <DeadlineRow items={deadlinesByDay(days.includes(mobileDay) ? mobileDay : days[0]!)} />
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-stone-200 bg-white">
              <HourGutter hours={hours} />
              {dayColumn(days.includes(mobileDay) ? mobileDay : days[0]!)}
            </div>
          </div>

          {/* Desktop: semana completa */}
          <div className="hidden overflow-hidden rounded-lg border border-stone-200 bg-white md:block">
            <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-stone-200 bg-stone-50">
              <div />
              {days.map((key, i) => (
                <div
                  key={key}
                  className={`px-2 py-2 text-center text-xs ${key === todayKey ? 'font-semibold text-accent' : 'text-stone-600'}`}
                >
                  {WEEKDAY_SHORT[i]} {Number(key.slice(8))}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-stone-200">
              <div className="px-1 py-1 text-right text-[10px] text-stone-500">prazos</div>
              {days.map((key) => (
                <div key={key} className="min-h-8 min-w-0 border-l border-stone-100 p-1">
                  <DeadlineList items={deadlinesByDay(key)} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
              <HourGutter hours={hours} />
              {days.map(dayColumn)}
            </div>
          </div>
        </>
      )}
      <Legend />
    </div>
  );
}

function HourGutter({ hours }: { hours: number[] }) {
  return (
    <div aria-hidden="true">
      {hours.map((h) => (
        <div
          key={h}
          className="relative -top-1.5 pr-1 text-right text-[10px] text-stone-500"
          style={{ height: HOUR_PX }}
        >
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  );
}

function NowLine({ gridStart }: { gridStart: number }) {
  const p = instantToZoned(new Date(), TZ);
  const top = ((p.hour * 60 + p.minute - gridStart * 60) / 60) * HOUR_PX;
  if (top < 0) return null;
  return <div aria-hidden="true" className="absolute inset-x-0 z-20 border-t-2 border-red-500" style={{ top }} />;
}

type Deadline = { id: string; label: string; kind: string; done: boolean; color: string | null };

function DeadlineList({ items }: { items: Deadline[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map((d) => (
        <li
          key={d.id}
          className={`flex items-center gap-1 truncate text-[11px] ${d.done ? 'text-stone-400 line-through' : 'text-stone-700'}`}
          title={`${d.kind}: ${d.label}`}
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: d.color ?? '#a8a29e' }}
          />
          <span className="min-w-0 truncate">{d.label}</span>
        </li>
      ))}
    </ul>
  );
}

function DeadlineRow({ items }: { items: Deadline[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 rounded-lg border border-stone-200 bg-white p-2">
      <p className="mb-1 text-[11px] font-medium text-stone-500">Prazos e dia inteiro</p>
      <DeadlineList items={items} />
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500" aria-label="Legenda">
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border-l-4 border-stone-400 bg-stone-100" />
        Aula
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-stone-300 bg-white" />
        Evento
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-dashed border-stone-300" />
        Não bloqueia estudo
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border-l-4 border-accent bg-accent-soft" />
        Estudo planeado
      </li>
      <li className="flex items-center gap-1.5">
        <AlertTriangle aria-hidden="true" className="size-3 text-red-600" />
        Conflito
      </li>
    </ul>
  );
}
