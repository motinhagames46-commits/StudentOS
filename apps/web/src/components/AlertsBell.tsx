import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAlerts } from '../hooks/queries';
import { formatDateTime } from '../lib/format';
import { DisciplineChip } from './ui';

/** Alertas na aplicação: o que vence nas próximas 48 h e tarefas em atraso (RF17). */
export function AlertsBell({ align = 'left' }: { align?: 'left' | 'right' }) {
  const { data } = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = (data?.count ?? 0) + (data?.overdue ?? 0);
  const label = count ? `Alertas: ${count} por ver` : 'Alertas: nada nas próximas 48 horas';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800"
      >
        <Bell aria-hidden="true" className="size-4" />
        {count > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Alertas"
          className={`absolute top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200 bg-white p-3 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Próximas 48 horas</p>
          {data && data.count === 0 && data.overdue === 0 ? (
            <p className="py-3 text-center text-sm text-stone-500">Nada a vencer. Bom trabalho!</p>
          ) : (
            <ul className="space-y-1">
              {data?.overdue ? (
                <li>
                  <Link
                    to="/tarefas"
                    onClick={() => setOpen(false)}
                    className="block rounded-lg bg-red-50 px-2 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                  >
                    {data.overdue} {data.overdue === 1 ? 'tarefa em atraso' : 'tarefas em atraso'}
                  </Link>
                </li>
              ) : null}
              {data?.assessments.map((a) => (
                <li key={`a${a.id}`}>
                  <Link
                    to={`/disciplinas/${a.discipline.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-stone-50"
                  >
                    <DisciplineChip discipline={a.discipline} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">{a.name}</span>
                    {a.date && <span className="text-xs text-stone-500">{formatDateTime(a.date)}</span>}
                  </Link>
                </li>
              ))}
              {data?.tasks.map((t) => (
                <li key={`t${t.id}`}>
                  <Link
                    to="/tarefas"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-stone-50"
                  >
                    {t.discipline && <DisciplineChip discipline={t.discipline} />}
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-900">{t.title}</span>
                    {t.dueDate && <span className="text-xs text-stone-500">{formatDateTime(t.dueDate)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
