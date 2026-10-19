import { Pause, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StudyByDayChart } from '../components/charts';
import {
  Badge,
  Button,
  Card,
  DisciplineChip,
  EmptyState,
  ErrorState,
  FormError,
  LoadingList,
  PageHeader,
  SelectField,
  TextField,
} from '../components/ui';
import {
  useDisciplines,
  usePauseStudySession,
  useStartStudySession,
  useStats,
  useStopStudySession,
  useStudySessions,
} from '../hooks/queries';
import { useMe } from '../hooks/useAuth';
import { errorMessage } from '../lib/api';
import { formatClock, formatDateTime, formatDuration } from '../lib/format';
import type { StudySession } from '../lib/types';

const DAY = 24 * 60 * 60 * 1000;

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }).format(
    new Date(iso),
  );

/** Tempo de foco: duração total menos as pausas (terminadas e, se existir, a que está em curso). */
const focusMs = (s: StudySession, now = Date.now()) => {
  const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
  const ongoingPause = s.pausedAt && !s.endedAt ? now - new Date(s.pausedAt).getTime() : 0;
  return Math.max(0, end - new Date(s.startedAt).getTime() - s.pausedSeconds * 1000 - ongoingPause);
};
const durationMs = (s: StudySession) => (s.endedAt ? focusMs(s) : 0);

// Modo foco (spec §7.6): presets editáveis; a escolha fica só neste browser, por conveniência.
const PRESETS = {
  livre: { label: 'Livre (sem objetivo)', target: null, rest: null },
  '25/5': { label: '25 min foco / 5 min pausa', target: 25, rest: 5 },
  '50/10': { label: '50 min foco / 10 min pausa', target: 50, rest: 10 },
  custom: { label: 'Personalizado', target: null, rest: null },
} as const;
type PresetKey = keyof typeof PRESETS;
const PRESET_STORAGE_KEY = 'studentos.focusPreset';

function loadPreset(): { key: PresetKey; target: string; rest: string } {
  const fallback = { key: 'livre' as PresetKey, target: '40', rest: '10' };
  try {
    const saved = JSON.parse(window.localStorage.getItem(PRESET_STORAGE_KEY) ?? 'null');
    return saved && saved.key in PRESETS ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

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
  const pause = usePauseStudySession();
  const stats = useStats(14);
  const [disciplineId, setDisciplineId] = useState('');
  const [preset, setPreset] = useState(loadPreset);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
    } catch {
      // sem armazenamento local: a escolha não é lembrada, mas tudo funciona
    }
  }, [preset]);

  const customTarget = Number(preset.target);
  const customRest = Number(preset.rest);
  const customInvalid =
    preset.key === 'custom' &&
    (!Number.isInteger(customTarget) ||
      customTarget < 5 ||
      customTarget > 180 ||
      !Number.isInteger(customRest) ||
      customRest < 0 ||
      customRest > 60);

  const running = sessions.data?.find((s) => s.endedAt === null);
  const finished = sessions.data?.filter((s) => s.endedAt !== null) ?? [];
  const week = finished.filter((s) => new Date(s.startedAt).getTime() >= range.weekStart);
  const weekTotal = week.reduce((sum, s) => sum + durationMs(s), 0);
  const actionError = start.error ?? stop.error ?? pause.error;

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
                <RunningClock session={running} />
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                  Desde as {formatTime(running.startedAt)}
                  {running.discipline ? (
                    <DisciplineChip discipline={running.discipline} />
                  ) : (
                    <span>· sem disciplina</span>
                  )}
                  {running.pausedAt && <Badge tone="amber">Em pausa</Badge>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => pause.mutate({ id: running.id, action: running.pausedAt ? 'resume' : 'pause' })}
                  loading={pause.isPending}
                >
                  {running.pausedAt ? (
                    <Play aria-hidden="true" className="size-4" />
                  ) : (
                    <Pause aria-hidden="true" className="size-4" />
                  )}
                  {running.pausedAt ? 'Retomar' : 'Pausar'}
                </Button>
                <Button variant="danger" onClick={() => stop.mutate(running.id)} loading={stop.isPending}>
                  <Square aria-hidden="true" className="size-4" />
                  Parar
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (customInvalid) return;
                const chosen = PRESETS[preset.key];
                start.mutate({
                  disciplineId: disciplineId ? Number(disciplineId) : null,
                  targetMinutes: preset.key === 'custom' ? customTarget : chosen.target,
                  breakMinutes: preset.key === 'custom' ? customRest : chosen.rest,
                });
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
              <SelectField
                label="Modo foco"
                value={preset.key}
                onChange={(e) => setPreset((p) => ({ ...p, key: e.target.value as PresetKey }))}
                className="min-w-48 flex-1"
              >
                {Object.entries(PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </SelectField>
              {preset.key === 'custom' && (
                <>
                  <TextField
                    label="Foco (min)"
                    type="number"
                    min={5}
                    max={180}
                    required
                    value={preset.target}
                    onChange={(e) => setPreset((p) => ({ ...p, target: e.target.value }))}
                    className="w-28"
                  />
                  <TextField
                    label="Pausa (min)"
                    type="number"
                    min={0}
                    max={60}
                    required
                    value={preset.rest}
                    onChange={(e) => setPreset((p) => ({ ...p, rest: e.target.value }))}
                    className="w-28"
                  />
                </>
              )}
              <Button type="submit" loading={start.isPending} disabled={customInvalid}>
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

      <Card title="Tempo de estudo por dia (últimas 2 semanas)" className="mb-4">
        {stats.isPending ? (
          <LoadingList rows={3} />
        ) : stats.error ? (
          <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />
        ) : (
          <StudyByDayChart days={stats.data.studyByDay} />
        )}
      </Card>

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

/**
 * Cronómetro da sessão em curso: mostra só o tempo de foco (para durante as pausas) e, com um preset,
 * a contagem decrescente até ao objetivo. Ao atingi-lo sugere a pausa, sem parar a sessão.
 */
function RunningClock({ session }: { session: StudySession }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const focus = focusMs(session, now);
  const targetMs = session.targetMinutes ? session.targetMinutes * 60_000 : null;
  return (
    <div>
      <p
        role="timer"
        aria-label="Tempo de foco"
        className="text-4xl font-semibold tabular-nums tracking-tight text-stone-900"
      >
        {formatClock(focus)}
      </p>
      {session.pausedAt && (
        <p className="text-sm text-amber-900">Em pausa há {formatClock(now - new Date(session.pausedAt).getTime())}</p>
      )}
      {targetMs !== null && focus < targetMs && (
        <p className="text-sm text-stone-600">
          Objetivo {session.targetMinutes} min · faltam{' '}
          <span className="tabular-nums">{formatClock(targetMs - focus)}</span>
        </p>
      )}
      <div role="status">
        {targetMs !== null && focus >= targetMs && (
          <p className="text-sm font-medium text-green-800">
            Objetivo de {session.targetMinutes} min atingido
            {session.breakMinutes ? ` — faz uma pausa de ${session.breakMinutes} min.` : '.'}
          </p>
        )}
      </div>
    </div>
  );
}
