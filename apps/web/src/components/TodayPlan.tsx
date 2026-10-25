import {
  DEFAULT_TIMEZONE,
  addDaysToKey,
  startOfZonedDay,
  zonedDayKey,
  type StudySessionStartInput,
} from '@studentos/shared';
import { CalendarPlus, Clock, FileUp, ListPlus, Play, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePlannerSessions, useStartStudySession, useSuggestion } from '../hooks/queries';
import { ApiError, errorMessage } from '../lib/api';
import { formatTime, studyTitle } from '../lib/format';
import type { Suggestion } from '../lib/types';
import { Badge, Button, Card, EmptyState, ErrorState, FormError, Skeleton } from './ui';

const statusLabels = { PLANNED: 'Planeada', COMPLETED: 'Concluída', MISSED: 'Falhada', CANCELLED: 'Retirada' } as const;

/**
 * Atalhos do painel (spec §7.1): cada um leva a uma funcionalidade que existe e funciona.
 * Sem "Ligar calendário" enquanto as integrações não estiverem disponíveis.
 */
export function QuickActions() {
  const actions = [
    { to: '/tarefas', label: 'Adicionar tarefa', icon: ListPlus },
    { to: '/importar', label: 'Importar horário', icon: FileUp },
    { to: '/preferencias', label: 'Definir disponibilidade', icon: Clock },
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
                    {studyTitle(s.task?.title ?? s.assessment?.name, s.discipline?.code)}
                  </span>
                  <Badge tone={s.status === 'COMPLETED' ? 'green' : s.status === 'MISSED' ? 'red' : 'accent'}>
                    {statusLabels[s.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {suggestion.data && <SuggestionBox suggestion={suggestion.data} />}
        </div>
      )}
    </Card>
  );
}

/**
 * Sessão de foco que «Começar agora» inicia (spec §11.7: aceitar a recomendação). Uma sessão planeada
 * fica ligada ao foco, como em «Começar foco» no plano; um item leva a sua disciplina, se tiver.
 */
export function focusStartFor(suggestion: Suggestion): StudySessionStartInput | null {
  if (suggestion.kind === 'session') return { plannedSessionId: suggestion.session.id };
  if (suggestion.kind === 'item')
    return suggestion.item.disciplineId ? { disciplineId: suggestion.item.disciplineId } : {};
  return null;
}

function SuggestionBox({ suggestion }: { suggestion: Suggestion }) {
  const navigate = useNavigate();
  const start = useStartStudySession();
  const focus = focusStartFor(suggestion);
  const inProgress = start.error instanceof ApiError && start.error.code === 'STUDY_SESSION_IN_PROGRESS';

  return (
    <div className="space-y-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
      <p className="flex gap-2">
        <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          <strong>O que estudar agora: </strong>
          {suggestion.message}
          {suggestion.kind === 'item' && suggestion.needsEstimate && (
            <>
              {' '}
              <Link
                to={
                  suggestion.item.type === 'assessment' && suggestion.item.disciplineId
                    ? `/disciplinas/${suggestion.item.disciplineId}`
                    : '/tarefas'
                }
                className="font-medium text-accent underline"
              >
                Indicar duração
              </Link>
            </>
          )}
        </span>
      </p>
      {focus && (
        <div className="pl-6">
          <Button
            variant="secondary"
            loading={start.isPending}
            onClick={() => start.mutate(focus, { onSuccess: () => navigate('/sessoes') })}
          >
            <Play aria-hidden="true" className="size-4" />
            Começar agora
          </Button>
        </div>
      )}
      {inProgress ? (
        <p role="alert" className="pl-6 text-sm text-stone-700">
          Já tens uma sessão de estudo em curso.{' '}
          <Link to="/sessoes" className="font-medium text-accent underline">
            Ver sessão
          </Link>
        </p>
      ) : (
        <FormError message={start.error ? errorMessage(start.error) : null} />
      )}
    </div>
  );
}
