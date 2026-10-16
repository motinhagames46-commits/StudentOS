import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useCalendar, useUpdateTask } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { formatGrade } from '../lib/format';
import type { CalendarData } from '../lib/types';
import { TaskList } from './TaskList';
import { Button, DisciplineChip, ErrorState, IconButton } from './ui';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const monthTitle = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });
const longDay = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

const pad = (n: number) => String(n).padStart(2, '0');
/** Chave aaaa-mm-dd no fuso local. */
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Grelha de semanas completas (segunda a domingo) que cobre o mês. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const end = addDays(last, 6 - ((last.getDay() + 6) % 7));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

type DayItems = { tasks: CalendarData['tasks']; assessments: CalendarData['assessments'] };

/** Vista de calendário mensal com prazos de tarefas e datas de avaliações (RF15). */
export function CalendarView() {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => keyOf(today));
  const updateTask = useUpdateTask();

  const days = useMemo(() => monthGrid(month), [month]);
  const from = days[0]!.toISOString();
  const to = addDays(days[days.length - 1]!, 1).toISOString();
  const { data, error, refetch, isFetching } = useCalendar(from, to);

  const byDay = useMemo(() => {
    const map = new Map<string, DayItems>();
    const get = (k: string) => map.get(k) ?? (map.set(k, { tasks: [], assessments: [] }), map.get(k)!);
    data?.tasks.forEach((t) => t.dueDate && get(keyOf(new Date(t.dueDate))).tasks.push(t));
    data?.assessments.forEach((a) => a.date && get(keyOf(new Date(a.date))).assessments.push(a));
    return map;
  }, [data]);

  const todayKey = keyOf(today);
  const selectedItems = byDay.get(selected) ?? { tasks: [], assessments: [] };
  const title = monthTitle.format(month);

  function shiftMonth(n: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + n, 1);
    setMonth(next);
    setSelected(keyOf(next));
  }

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-stone-900 first-letter:uppercase" aria-live="polite">
          {title}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            onClick={() => {
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(todayKey);
            }}
          >
            Hoje
          </Button>
          <IconButton label="Mês anterior" onClick={() => shiftMonth(-1)}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton label="Mês seguinte" onClick={() => shiftMonth(1)}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-lg border border-stone-200 transition-opacity ${isFetching ? 'opacity-70' : ''}`}
      >
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-xs font-medium text-stone-500">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-stone-200">
          {days.map((d) => {
            const k = keyOf(d);
            const items = byDay.get(k);
            const count = (items?.tasks.length ?? 0) + (items?.assessments.length ?? 0);
            const inMonth = d.getMonth() === month.getMonth();
            const isSelected = k === selected;
            const label = `${longDay.format(d)}${count ? `, ${count} ${count === 1 ? 'item' : 'itens'}` : ''}`;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelected(k)}
                aria-label={label}
                aria-pressed={isSelected}
                className={`flex min-h-14 flex-col items-stretch gap-1 p-1.5 text-left sm:min-h-24 ${
                  isSelected
                    ? 'bg-accent-soft'
                    : inMonth
                      ? 'bg-white hover:bg-stone-50'
                      : 'bg-stone-50 hover:bg-stone-100'
                }`}
              >
                <span
                  className={`flex size-6 items-center justify-center self-start rounded-full text-xs ${
                    k === todayKey
                      ? 'bg-accent font-semibold text-white'
                      : inMonth
                        ? 'text-stone-800'
                        : 'text-stone-400'
                  }`}
                >
                  {d.getDate()}
                </span>
                {items && (
                  <>
                    {/* Mobile: pontos */}
                    <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                      {[...items.assessments, ...items.tasks].slice(0, 4).map((it) => (
                        <span
                          key={`${'weight' in it ? 'a' : 't'}${it.id}`}
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: it.discipline?.color ?? '#a8a29e' }}
                        />
                      ))}
                    </span>
                    {/* Desktop: até 3 itens */}
                    <span className="hidden flex-col gap-0.5 sm:flex" aria-hidden="true">
                      {items.assessments.slice(0, 3).map((a) => (
                        <CalendarPill
                          key={`a${a.id}`}
                          color={a.discipline.color}
                          text={`${a.discipline.code} · ${a.name}`}
                          strong
                        />
                      ))}
                      {items.tasks.slice(0, Math.max(0, 3 - items.assessments.length)).map((t) => (
                        <CalendarPill
                          key={`t${t.id}`}
                          color={t.discipline?.color ?? null}
                          text={t.title}
                          done={t.status === 'DONE'}
                        />
                      ))}
                      {count > 3 && <span className="px-1 text-[11px] text-stone-500">+{count - 3}</span>}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="dia-selecionado" className="space-y-3">
        <h3 id="dia-selecionado" className="text-sm font-semibold text-stone-900 first-letter:uppercase">
          {longDay.format(new Date(`${selected}T12:00:00`))}
        </h3>
        {selectedItems.assessments.length > 0 && (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {selectedItems.assessments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <DisciplineChip discipline={a.discipline} />
                <Link
                  to={`/disciplinas/${a.discipline.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900 hover:underline"
                >
                  {a.name}
                </Link>
                <span className="text-xs text-stone-500">
                  {a.score !== null ? `Nota ${formatGrade(a.score)}` : `Peso ${formatGrade(a.weight)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <TaskList
          tasks={selectedItems.tasks}
          onToggle={(t) => updateTask.mutate(t)}
          emptyMessage={selectedItems.assessments.length ? 'Sem tarefas neste dia.' : 'Nada marcado para este dia.'}
          compact
        />
      </section>
    </div>
  );
}

function CalendarPill({
  color,
  text,
  strong,
  done,
}: {
  color: string | null;
  text: string;
  strong?: boolean;
  done?: boolean;
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight ${
        strong ? 'bg-stone-100 font-medium text-stone-800' : 'text-stone-700'
      } ${done ? 'text-stone-400 line-through' : ''}`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? '#a8a29e' }}
      />
      <span className="truncate">{text}</span>
    </span>
  );
}
