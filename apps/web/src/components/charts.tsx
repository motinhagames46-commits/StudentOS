// Gráficos simples em HTML/CSS (RF14), sem biblioteca externa.
// Barras finas (≤ 24 px) com ponta arredondada de 4 px e base reta, texto sempre em cor de texto,
// identidade dada pela marca colorida ao lado, tooltip ao passar o rato e tabela alternativa.
import type { ReactNode } from 'react';
import { formatDuration } from '../lib/format';
import type { DisciplineRef } from '../lib/types';

const NO_DISCIPLINE_COLOR = '#a8a29e';
const minutesLabel = (m: number) => formatDuration(m * 60000);

/** Tempo de estudo por disciplina: barras horizontais ordenadas, com rótulo e valor diretos. */
export function StudyByDisciplineChart({ rows }: { rows: { discipline: DisciplineRef | null; minutes: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  const total = rows.reduce((s, r) => s + r.minutes, 0);

  return (
    <ul className="space-y-2.5" aria-label="Tempo de estudo por disciplina">
      {rows.map((r) => {
        const name = r.discipline?.name ?? 'Sem disciplina';
        const share = total ? Math.round((r.minutes / total) * 100) : 0;
        return (
          <li
            key={r.discipline?.id ?? 'none'}
            className="group relative grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm text-stone-700">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: r.discipline?.color ?? NO_DISCIPLINE_COLOR }}
              />
              <span className="truncate" title={name}>
                {r.discipline?.code ?? name}
              </span>
            </span>
            <span className="h-3 rounded-r bg-stone-100" aria-hidden="true">
              <span
                className="block h-full rounded-r"
                style={{
                  width: `${Math.max(2, (r.minutes / max) * 100)}%`,
                  backgroundColor: r.discipline?.color ?? NO_DISCIPLINE_COLOR,
                }}
              />
            </span>
            <span className="text-right text-sm tabular-nums text-stone-700">{minutesLabel(r.minutes)}</span>
            <Tooltip>
              {name}: {minutesLabel(r.minutes)} ({share}%)
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

const weekday = new Intl.DateTimeFormat('pt-PT', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' });
const fullDate = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
/** "aaaa-mm-dd" → Date ao meio-dia local (evita saltos de fuso ao formatar). */
const parseDay = (key: string) => new Date(`${key}T12:00:00`);

/** Minutos de estudo por dia: colunas de uma só cor, rótulo só no máximo e tooltip por coluna. */
export function StudyByDayChart({ days }: { days: { date: string; minutes: number }[] }) {
  const max = Math.max(0, ...days.map((d) => d.minutes));
  const maxIndex = max > 0 ? days.findIndex((d) => d.minutes === max) : -1;
  const lastIndex = days.length - 1;

  return (
    <figure>
      <div className="flex h-36 items-end gap-1 border-b border-stone-200 pt-6" aria-hidden="true">
        {days.map((d, i) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center">
            {i === maxIndex && (
              <span
                className="absolute mb-0.5 text-[11px] whitespace-nowrap text-stone-600 tabular-nums"
                style={{ bottom: `${(d.minutes / max) * 100}%` }}
              >
                {minutesLabel(d.minutes)}
              </span>
            )}
            <span
              className="w-full max-w-6 rounded-t bg-accent transition-opacity group-hover:opacity-80"
              style={{ height: max ? `${(d.minutes / max) * 100}%` : 0, minHeight: d.minutes ? 2 : 0 }}
            />
            <Tooltip>
              {fullDate.format(parseDay(d.date))}: {d.minutes ? minutesLabel(d.minutes) : 'sem estudo'}
            </Tooltip>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[11px] text-stone-500" aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.date} className="flex-1 text-center">
            {i === lastIndex
              ? 'Hoje'
              : days.length <= 7
                ? weekday.format(parseDay(d.date)).replace('.', '')
                : i % 3 === 0
                  ? dayMonth.format(parseDay(d.date))
                  : ''}
          </span>
        ))}
      </div>
      <figcaption>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-stone-500 hover:text-stone-800">Ver tabela</summary>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="text-stone-500">
                <th scope="col" className="py-1 font-medium">
                  Dia
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Tempo de estudo
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-stone-100">
                  <td className="py-1">{fullDate.format(parseDay(d.date))}</td>
                  <td className="py-1 text-right tabular-nums">{minutesLabel(d.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}

/** Progresso das tarefas: concluídas vs. por fazer, com 2 px de intervalo entre segmentos. */
export function TaskProgress({ done, todo }: { done: number; todo: number }) {
  const total = done + todo;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <p className="flex items-baseline justify-between text-sm text-stone-600">
        <span>
          <strong className="text-stone-900">{done}</strong> de {total} tarefas concluídas
        </span>
        <span className="tabular-nums">{pct}%</span>
      </p>
      <div
        role="progressbar"
        aria-label="Tarefas concluídas"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2 flex h-3 gap-0.5"
      >
        {done > 0 && <span className="rounded-l bg-accent" style={{ flexGrow: done }} />}
        {todo > 0 && <span className={`bg-stone-200 ${done ? 'rounded-r' : 'rounded'}`} style={{ flexGrow: todo }} />}
        {total === 0 && <span className="flex-1 rounded bg-stone-100" />}
      </div>
    </div>
  );
}

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-stone-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow group-hover:block"
    >
      {children}
    </span>
  );
}
