import { Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, DisciplineChip, EmptyState, ErrorState, FormError, LoadingList, PageHeader, SelectField } from '../components/ui';
import { useDisciplines, useStartStudySession, useStopStudySession, useStudySessions } from '../hooks/queries';
import { useMe } from '../hooks/useAuth';
import { errorMessage } from '../lib/api';
import { formatClock, formatDateTime, formatDuration } from '../lib/format';
import type { StudySession } from '../lib/types';

const DAY = 24 * 60 * 60 * 1000;

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }).format(new Date(iso));

const durationMs = (s: StudySession) => (s.endedAt ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() : 0);

/** Sessões de estudo: temporizador iniciar/parar e histórico dos últimos 30 dias (RF13 / RN11). */
export function StudySessionsPage() {
  const { data: me } = useMe();
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 30 * DAY).toISOString(), weekStart: now - 7 * DAY };
  });
  const sessions = useStudySessions({ from: range.from });
  const disciplines = useDisciplines(me?.activeSemester?.id);
  const start = useStartStudySession();
  const stop = useStopStudySession();
  const [disciplineId, setDisciplineId] = useState('');

  const running = sessions.data?.find((s) => s.endedAt === null);
  const finished = sessions.data?.filter((s) => s.endedAt !== null) ?? [];
  const week = finished.filter((s) => new Date(s.startedAt).getTime() >= range.weekStart);
  const weekTotal = week.reduce((sum, s) => sum + durationMs(s), 0);
  const actionError = start.error ?? stop.error;

  return (
    <>
      <PageHeader title="Sessões de estudo" subtitle="Regista o tempo que dedicas a cada disciplina." />

      <div className="mb-4 grid gap-4 md:grid-cols-[1fr_16rem]">
        <Card title="Temporizador">
          {sessions.isPending ? (
            <LoadingList rows={2} />
          ) : running ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <RunningClock startedAt={running.startedAt} />
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                  Desde as {formatTime(running.startedAt)}
                  {running.discipline ? <DisciplineChip discipline={running.discipline} /> : <span>· sem disciplina</span>}
                </p>
              </div>
              <Button variant="danger" onClick={() => stop.mutate(running.id)} loading={stop.isPending}>
                <Square aria-hidden="true" className="size-4" />
                Parar
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                start.mutate({ disciplineId: disciplineId ? Number(disciplineId) : null });
              }}
            >
              <SelectField
                label="Disciplina (opcional)"
                value={disciplineId}
                onChange={(e) => setDisciplineId(e.target.value)}
                className="min-w-48 flex-1"
              >
                <option value="">Sem disciplina</option>
                {disciplines.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </SelectField>
              <Button type="submit" loading={start.isPending}>
                <Play aria-hidden="true" className="size-4" />
                Iniciar
              </Button>
            </form>
          )}
          {actionError && (
            <div className="mt-3">
              <FormError message={errorMessage(actionError)} />
            </div>
          )}
        </Card>

        <Card title="Últimos 7 dias">
          <p className="text-2xl font-semibold tabular-nums text-stone-900">{formatDuration(weekTotal)}</p>
          <p className="text-sm text-stone-500">
            {week.length} {week.length === 1 ? 'sessão terminada' : 'sessões terminadas'}
          </p>
        </Card>
      </div>

      <Card title="Histórico (últimos 30 dias)">
        {sessions.error ? (
          <ErrorState message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} />
        ) : sessions.isPending ? (
          <LoadingList rows={4} />
        ) : sessions.data.length === 0 ? (
          <EmptyState message="Ainda não registaste sessões de estudo. Escolhe uma disciplina e carrega em Iniciar." />
        ) : (
          <ul className="divide-y divide-stone-100">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-900">
                    {formatDateTime(s.startedAt)}
                    {s.endedAt && <span className="font-normal text-stone-500">– {formatTime(s.endedAt)}</span>}
                    {s.discipline && <DisciplineChip discipline={s.discipline} />}
                  </p>
                  {s.notes && <p className="truncate text-xs text-stone-500">{s.notes}</p>}
                </div>
                {s.endedAt ? (
                  <span className="shrink-0 text-sm tabular-nums text-stone-700">{formatDuration(durationMs(s))}</span>
                ) : (
                  <Badge tone="blue">Em curso</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Cronómetro da sessão em curso; só existe enquanto há uma sessão a decorrer. */
function RunningClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p role="timer" aria-label="Tempo decorrido" className="text-4xl font-semibold tabular-nums tracking-tight text-stone-900">
      {formatClock(now - new Date(startedAt).getTime())}
    </p>
  );
}
