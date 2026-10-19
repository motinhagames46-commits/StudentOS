import { DEFAULT_TIMEZONE, addDaysToKey, startOfZonedDay, zonedDayKey } from '@studentos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Pin, PinOff, Play, RefreshCw, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { WeekView, type TimedItem } from '../components/WeekView';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormError,
  LoadingList,
  PageHeader,
  TextField,
} from '../components/ui';
import {
  useConfirmPlan,
  useDiscardPlan,
  usePlannedSessionAction,
  usePlannerSessions,
  usePlanPreview,
} from '../hooks/queries';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatTime, isoToZonedInput, studyTitle, zonedInputToIso } from '../lib/format';
import type { PlannedSession, PlanView } from '../lib/types';

const TZ = DEFAULT_TIMEZONE;
const statusLabels: Record<PlannedSession['status'], string> = {
  PLANNED: 'Planeada',
  COMPLETED: 'Concluída',
  MISSED: 'Falhada',
  CANCELLED: 'Retirada',
};
const statusTone = { PLANNED: 'blue', COMPLETED: 'green', MISSED: 'red', CANCELLED: 'neutral' } as const;

const longDay = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

function sessionTitle(s: PlannedSession) {
  return studyTitle(s.task?.title ?? s.assessment?.name, s.discipline?.code);
}

/** Plano de estudo (spec §11.6): proposta → confirmação; ações por sessão; replaneamento. */
export function PlanPage() {
  const todayKey = zonedDayKey(new Date(), TZ);
  const range = useMemo(
    () => ({
      from: startOfZonedDay(addDaysToKey(todayKey, -14), TZ).toISOString(),
      to: startOfZonedDay(addDaysToKey(todayKey, 35), TZ).toISOString(),
    }),
    [todayKey],
  );
  const planner = usePlannerSessions(range.from, range.to);
  const preview = usePlanPreview();
  const [missedNotice, setMissedNotice] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const draft = preview.data && preview.data.status === 'DRAFT' ? preview.data : (planner.data?.draft ?? null);
  const sessions = useMemo(() => planner.data?.sessions ?? [], [planner.data]);

  const extraItems = useMemo<TimedItem[]>(() => {
    const confirmed = sessions.map((s): TimedItem => ({
      id: `plan:${s.id}`,
      start: s.startAt,
      end: s.endAt,
      title: sessionTitle(s),
      subtitle: `${statusLabels[s.status]}${s.pinned ? ' · fixada' : ''}`,
      color: s.discipline?.color ?? null,
      variant: 'study',
    }));
    const proposed = (draft?.proposal.sessions ?? []).map((p, i): TimedItem => ({
      id: `draft:${i}`,
      start: p.start,
      end: p.end,
      title: `Proposta: ${studyTitle(p.title, p.disciplineCode)}`,
      subtitle: `${p.minutes} min`,
      color: null,
      variant: 'free',
    }));
    const removed = new Set(draft?.proposal.removals.map((r) => `plan:${r.id}`));
    return [...confirmed.filter((c) => !removed.has(c.id)), ...proposed];
  }, [sessions, draft]);

  const upcoming = sessions.filter((s) => s.endAt >= new Date().toISOString() || s.status === 'PLANNED');
  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Plano de estudo"
        subtitle="Proposta determinística a partir das tuas tarefas, avaliações, aulas e disponibilidade. Nada muda sem confirmares."
        action={
          <div className="flex flex-wrap gap-2">
            {sessions.some((s) => s.status === 'PLANNED') && (
              <Button
                variant="secondary"
                loading={preview.isPending && preview.variables?.replan}
                onClick={() => preview.mutate({ replan: true })}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Replanear
              </Button>
            )}
            <Button loading={preview.isPending && !preview.variables?.replan} onClick={() => preview.mutate({})}>
              <Sparkles aria-hidden="true" className="size-4" />
              Gerar plano (7 dias)
            </Button>
          </div>
        }
      />

      {planner.error ? (
        <ErrorState message={errorMessage(planner.error)} onRetry={() => planner.refetch()} />
      ) : planner.isPending ? (
        <LoadingList rows={4} />
      ) : (
        <div className="space-y-4">
          {!planner.data.hasAvailability && (
            <EmptyState
              message="Ainda não indicaste quando podes estudar. Sem disponibilidade, o plano não marca sessões."
              action={
                <Link to="/preferencias" className="text-sm font-medium text-accent hover:underline">
                  Definir disponibilidade
                </Link>
              }
            />
          )}
          <FormError message={preview.error ? errorMessage(preview.error) : null} />
          {missedNotice && !draft && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Sessão marcada como falhada. Queres reorganizar o resto da semana?
              <Button
                variant="secondary"
                onClick={() => {
                  setMissedNotice(false);
                  preview.mutate({ replan: true });
                }}
              >
                Ver proposta de replaneamento
              </Button>
            </div>
          )}

          {draft && <DraftPanel draft={draft} onDone={() => preview.reset()} />}

          <Card>
            <WeekView
              extraItems={extraItems}
              selectedId={selectedId ? `plan:${selectedId}` : null}
              onSelect={(id) => setSelectedId(id.startsWith('plan:') ? Number(id.slice(5)) : null)}
            />
          </Card>

          {selected && (
            <SessionCard
              session={selected}
              onMissed={() => setMissedNotice(true)}
              onClose={() => setSelectedId(null)}
            />
          )}

          <Card title="Próximas sessões">
            {upcoming.length === 0 ? (
              <EmptyState message="Ainda não há sessões planeadas. Gera um plano para começar." />
            ) : (
              <ul className="space-y-3">
                {upcoming.slice(0, 30).map((s) => (
                  <li key={s.id}>
                    <SessionCard session={s} compact onMissed={() => setMissedNotice(true)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function DraftPanel({ draft, onDone }: { draft: PlanView; onDone: () => void }) {
  const confirm = useConfirmPlan();
  const discard = useDiscardPlan();
  const p = draft.proposal;
  const total = p.sessions.reduce((s, x) => s + x.minutes, 0);
  const byDay = new Map<string, typeof p.sessions>();
  for (const s of p.sessions) {
    const key = zonedDayKey(new Date(s.start), TZ);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const noEstimate = p.unplanned.filter((u) => u.reason === 'NO_ESTIMATE');
  const later = p.unplanned.filter((u) => u.reason === 'BEYOND_HORIZON');
  const other = p.unplanned.filter((u) => u.reason === 'NO_SPACE' || u.reason === 'PAST_DEADLINE');

  return (
    <Card
      title={`${p.kind === 'replan' ? 'Proposta de replaneamento' : 'Proposta de plano'} (versão ${draft.version})`}
      className="border-accent/40"
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone="blue">
            {p.sessions.length} sessões novas · {total} min
          </Badge>
          {p.removals.length > 0 && <Badge tone="amber">{p.removals.length} sessões futuras substituídas</Badge>}
          <Badge>Válida até {formatTime(draft.expiresAt)}</Badge>
        </div>
        <p className="text-xs text-stone-500">
          Sessões concluídas, fixadas e a decorrer ficam protegidas. As aulas e eventos ocupados nunca são usados.
        </p>
        {p.warnings.map((w) => (
          <p key={w} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {w}
          </p>
        ))}
        {other.length > 0 && (
          <div>
            <p className="font-medium text-stone-800">Ficou por planear</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-stone-700">
              {other.map((u) => (
                <li key={`${u.type}${u.itemId}`}>{u.message}</li>
              ))}
            </ul>
          </div>
        )}
        {later.length > 0 && (
          <div>
            <p className="font-medium text-stone-800">Para depois deste período</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-stone-600">
              {later.map((u) => (
                <li key={`${u.type}${u.itemId}`}>{u.message}</li>
              ))}
            </ul>
          </div>
        )}
        {noEstimate.length > 0 && (
          <details className="rounded-lg bg-stone-50 p-3">
            <summary className="cursor-pointer text-stone-700">
              {noEstimate.length} item(s) sem duração estimada — não entram no plano
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">
              {noEstimate.map((u) => (
                <li key={`${u.type}${u.itemId}`}>{u.title}</li>
              ))}
            </ul>
            <Link to="/tarefas" className="mt-2 inline-block text-xs font-medium text-accent hover:underline">
              Indicar durações nas tarefas
            </Link>
          </details>
        )}
        {[...byDay.entries()].map(([key, list]) => (
          <div key={key}>
            <p className="font-medium text-stone-800 first-letter:uppercase">
              {longDay.format(new Date(list[0]!.start))}
            </p>
            <ul className="mt-1 space-y-1.5">
              {list.map((s, i) => (
                <li key={i} className="rounded-lg border border-stone-200 px-3 py-2">
                  <p className="text-stone-900">
                    <span className="tabular-nums">
                      {formatTime(s.start)}–{formatTime(s.end)}
                    </span>{' '}
                    · {studyTitle(s.title, s.disciplineCode)}
                  </p>
                  <p className="text-xs text-stone-500">{s.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <FormError
          message={confirm.error ? errorMessage(confirm.error) : discard.error ? errorMessage(discard.error) : null}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            loading={discard.isPending}
            onClick={() => discard.mutate(draft.id, { onSuccess: onDone })}
          >
            Descartar
          </Button>
          <Button
            loading={confirm.isPending}
            disabled={p.sessions.length === 0 && p.removals.length === 0}
            onClick={() => confirm.mutate(draft.id, { onSuccess: onDone })}
          >
            Confirmar plano
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SessionCard({
  session: s,
  compact = false,
  onMissed,
  onClose,
}: {
  session: PlannedSession;
  compact?: boolean;
  onMissed: () => void;
  onClose?: () => void;
}) {
  const action = usePlannedSessionAction();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [moving, setMoving] = useState(false);
  const [start, setStart] = useState(isoToZonedInput(s.startAt));
  const [end, setEnd] = useState(isoToZonedInput(s.endAt));
  const [actual, setActual] = useState(String(s.plannedMinutes));
  const started = new Date(s.startAt) <= new Date();
  const startFocus = useMutation({
    mutationFn: () => api('/study-sessions/start', { method: 'POST', body: { plannedSessionId: s.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['study-sessions'] });
      navigate('/sessoes');
    },
  });

  const error = action.error ?? startFocus.error;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-900">
            {sessionTitle(s)}
            <Badge tone={statusTone[s.status]}>{statusLabels[s.status]}</Badge>
            {s.pinned && <Badge>Fixada</Badge>}
          </p>
          <p className="text-xs text-stone-600">
            <CalendarClock aria-hidden="true" className="mr-1 inline size-3.5" />
            {formatDate(s.startAt)}, {formatTime(s.startAt)}–{formatTime(s.endAt)} · {s.plannedMinutes} min
            {s.actualMinutes !== null && s.status === 'COMPLETED' && ` · real: ${s.actualMinutes} min`}
          </p>
          {!compact && <p className="mt-1 text-xs text-stone-500">{s.reason}</p>}
        </div>
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        )}
      </div>

      {s.status === 'PLANNED' && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={startFocus.isPending} onClick={() => startFocus.mutate()}>
              <Play aria-hidden="true" className="size-4" />
              Começar foco
            </Button>
            {started && (
              <div className="flex items-end gap-2">
                <TextField
                  label="Minutos reais"
                  type="number"
                  inputMode="numeric"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  className="w-28"
                />
                <Button
                  variant="secondary"
                  loading={action.isPending && action.variables?.kind === 'complete'}
                  onClick={() =>
                    action.mutate({ kind: 'complete', id: s.id, actualMinutes: Number(actual) || undefined })
                  }
                >
                  Concluída
                </Button>
              </div>
            )}
            {started && (
              <Button
                variant="secondary"
                loading={action.isPending && action.variables?.kind === 'miss'}
                onClick={() => action.mutate({ kind: 'miss', id: s.id }, { onSuccess: onMissed })}
              >
                Falhada
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => action.mutate({ kind: 'pin', id: s.id, pinned: !s.pinned })}
              aria-label={s.pinned ? 'Desafixar sessão' : 'Fixar sessão (o replaneamento não a altera)'}
            >
              {s.pinned ? (
                <PinOff aria-hidden="true" className="size-4" />
              ) : (
                <Pin aria-hidden="true" className="size-4" />
              )}
              {s.pinned ? 'Desafixar' : 'Fixar'}
            </Button>
            {!started && (
              <Button variant="ghost" onClick={() => setMoving((m) => !m)}>
                Mover
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm('Retirar esta sessão do plano?')) action.mutate({ kind: 'remove', id: s.id });
              }}
            >
              Retirar
            </Button>
          </div>
          {moving && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-stone-50 p-3">
              <TextField
                label="Início"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <TextField label="Fim" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              <Button
                loading={action.isPending && action.variables?.kind === 'move'}
                onClick={() => {
                  const startAt = zonedInputToIso(start);
                  const endAt = zonedInputToIso(end);
                  if (startAt && endAt)
                    action.mutate({ kind: 'move', id: s.id, startAt, endAt }, { onSuccess: () => setMoving(false) });
                }}
              >
                Guardar
              </Button>
              <p className="w-full text-xs text-stone-500">
                Uma sessão movida fica fixada: o replaneamento não a altera.
              </p>
            </div>
          )}
        </div>
      )}
      <FormError message={error ? errorMessage(error) : null} />
    </div>
  );
}
