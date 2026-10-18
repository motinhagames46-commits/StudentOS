import { DEFAULT_TIMEZONE, addDaysToKey, startOfZonedDay, zonedDayKey } from '@studentos/shared';
import { CalendarPlus, FileUp, Link2, ListPlus, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { usePlannerSessions, useSuggestion } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { formatTime } from '../lib/format';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from './ui';

const statusLabels = { PLANNED: 'Planeada', COMPLETED: 'Concluída', MISSED: 'Falhada', CANCELLED: 'Retirada' } as const;

/** Atalhos do painel (spec §7.1): cada um leva a uma funcionalidade que existe. */
export function QuickActions() {
  const actions = [
    { to: '/tarefas', label: 'Adicionar tarefa', icon: ListPlus },
    { to: '/importar', label: 'Importar horário', icon: FileUp },
    { to: '/integracoes', label: 'Ligar calendário', icon: Link2 },
    { to: '/plano', label: 'Planear semana', icon: CalendarPlus },
  ];
  return (
    <nav aria-label="Atalhos" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {actions.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-50"
        >
          <Icon aria-hidden="true" className="size-4 text-accent" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Plano de hoje e sugestão "O que devo estudar agora?" (spec §7.1, §11.7). */
export function TodayPlan() {
  const todayKey = zonedDayKey(new Date(), DEFAULT_TIMEZONE);
  const range = useMemo(
    () => ({
      from: startOfZonedDay(todayKey, DEFAULT_TIMEZONE).toISOString(),
      to: startOfZonedDay(addDaysToKey(todayKey, 1), DEFAULT_TIMEZONE).toISOString(),
    }),
    [todayKey],
  );
  const planner = usePlannerSessions(range.from, range.to);
  const suggestion = useSuggestion();

  return (
    <Card
      title="Plano de hoje"
      action={
        <Link to="/plano" className="text-sm text-accent hover:underline">
          Abrir plano
        </Link>
      }
    >
      {planner.error ? (
        <ErrorState message={errorMessage(planner.error)} onRetry={() => planner.refetch()} />
      ) : planner.isPending ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="space-y-3">
          {planner.data.sessions.length === 0 ? (
            <EmptyState
              message={
                planner.data.hasAvailability
                  ? 'Sem sessões de estudo planeadas para hoje.'
                  : 'Define quando podes estudar para receberes um plano.'
              }
              action={
                <Link
                  to={planner.data.hasAvailability ? '/plano' : '/preferencias'}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {planner.data.hasAvailability ? 'Planear semana' : 'Definir disponibilidade'}
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-stone-100">
              {planner.data.sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="w-24 shrink-0 text-xs text-stone-500 tabular-nums">
                    {formatTime(s.startAt)}–{formatTime(s.endAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-stone-900">
                    {s.task?.title ?? s.assessment?.name ?? 'Estudo'}
                  </span>
                  <Badge tone={s.status === 'COMPLETED' ? 'green' : s.status === 'MISSED' ? 'red' : 'blue'}>
                    {statusLabels[s.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {suggestion.data && (
            <p className="flex gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-blue-950">
              <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                <strong>O que estudar agora: </strong>
                {suggestion.data.kind === 'session'
                  ? `${suggestion.data.session.task?.title ?? suggestion.data.session.assessment?.name ?? 'sessão planeada'} — ${suggestion.data.message}`
                  : suggestion.data.message}
              </span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
