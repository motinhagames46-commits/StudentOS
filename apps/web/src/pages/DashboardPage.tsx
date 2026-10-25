import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { StudyByDisciplineChart, TaskProgress } from '../components/charts';
import { SetupProgress, StatTiles } from '../components/DashboardWidgets';
import { GradeStatusBadge } from '../components/GradeStatusBadge';
import { TaskList } from '../components/TaskList';
import { QuickActions, TodayPlan } from '../components/TodayPlan';
import { Card, DisciplineChip, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { useDashboard, useStats, useUpdateTask } from '../hooks/queries';
import { useMe } from '../hooks/useAuth';
import { errorMessage } from '../lib/api';
import { formatDate, formatDuration, formatGrade, relativeDay } from '../lib/format';
import type { GradeSummaryDto } from '../lib/types';

const todayLabel = () =>
  new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Lisbon',
  }).format(new Date());

/** Painel inicial — responde às três perguntas da secção 1.1 (RF10 / HU04). */
export function DashboardPage() {
  const { data: me } = useMe();
  const { data, isPending, error, refetch } = useDashboard();
  const updateTask = useUpdateTask();
  const stats = useStats(7);
  const firstName = me?.user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName ?? ''}`}
        subtitle={[todayLabel(), data?.activeSemester?.label ?? me?.activeSemester?.label].filter(Boolean).join(' · ')}
      />

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="space-y-4">
          <SetupProgress data={data} />
          <StatTiles data={data} studyMinutes={stats.data?.totalMinutes ?? null} />
          <QuickActions />
          <TodayPlan />

          {data.overdueTasks.length > 0 && (
            <Card title={`Em atraso (${data.overdueTasks.length})`} className="border-red-200">
              <TaskList tasks={data.overdueTasks} onToggle={(t) => updateTask.mutate(t)} compact />
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              collapsible
              title="Próximos 7 dias"
              action={
                <Link to="/tarefas" className="text-sm text-accent hover:underline">
                  Ver todas
                </Link>
              }
            >
              <TaskList
                tasks={data.upcomingTasks}
                onToggle={(t) => updateTask.mutate(t)}
                emptyMessage="Nada para os próximos 7 dias."
                compact
              />
            </Card>

            <Card collapsible title="Próximas avaliações">
              {data.upcomingAssessments.length === 0 ? (
                <EmptyState message="Sem avaliações marcadas." />
              ) : (
                <ul className="divide-y divide-stone-100">
                  {data.upcomingAssessments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <div
                        className="w-20 shrink-0 text-xs text-stone-500"
                        title={a.date ? formatDate(a.date) : undefined}
                      >
                        {a.date ? relativeDay(a.date) : '—'}
                      </div>
                      <Link
                        to={`/disciplinas/${a.discipline.id}`}
                        className="min-w-0 flex-1 text-sm text-stone-900 hover:underline"
                      >
                        {a.name}
                      </Link>
                      <DisciplineChip discipline={a.discipline} />
                      <span className="w-12 text-right text-xs text-stone-500">{formatGrade(a.weight)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card
            collapsible
            title="Estudo nos últimos 7 dias"
            action={
              <Link to="/sessoes" className="text-sm text-accent hover:underline">
                Sessões
              </Link>
            }
          >
            {stats.isPending ? (
              <Skeleton className="h-24" />
            ) : stats.error ? (
              <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />
            ) : (
              <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
                <div>
                  <p className="mb-3 text-sm text-stone-600">
                    Total: <strong className="text-stone-900">{formatDuration(stats.data.totalMinutes * 60000)}</strong>
                  </p>
                  {stats.data.studyByDiscipline.length ? (
                    <StudyByDisciplineChart rows={stats.data.studyByDiscipline} />
                  ) : (
                    <EmptyState
                      message="Ainda não registaste estudo esta semana."
                      action={
                        <Link to="/sessoes" className="text-sm font-medium text-accent hover:underline">
                          Iniciar uma sessão
                        </Link>
                      }
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <TaskProgress done={stats.data.tasks.done} todo={stats.data.tasks.todo} />
                  <p className="text-xs text-stone-500">
                    {stats.data.tasks.completedInRange}{' '}
                    {stats.data.tasks.completedInRange === 1 ? 'concluída' : 'concluídas'} nos últimos 7 dias
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card
            collapsible
            title="Médias por disciplina"
            action={
              <Link to="/disciplinas" className="text-sm text-accent hover:underline">
                Gerir
              </Link>
            }
          >
            {data.disciplines.length === 0 ? (
              <EmptyState
                message="Ainda não tens disciplinas."
                action={
                  <Link to="/disciplinas" className="text-sm font-medium text-accent hover:underline">
                    Criar disciplina
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-stone-100">
                {data.disciplines.map((d) => (
                  <li key={d.id}>
                    <Link to={`/disciplinas/${d.id}`} className="group flex items-center gap-3 py-3">
                      <span
                        aria-hidden="true"
                        className="h-8 w-1 rounded-full"
                        style={{ backgroundColor: d.color ?? '#a8a29e' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-900 group-hover:underline">{d.name}</p>
                        <RequiredHint grades={d.grades} />
                      </div>
                      <GradeStatusBadge grades={d.grades} passingGrade={d.passingGrade} />
                      <span className="w-14 text-right text-lg font-semibold tabular-nums text-stone-900">
                        {formatGrade(d.grades.finalGrade ?? d.grades.currentAverage, 1)}
                      </span>
                      <ArrowRight aria-hidden="true" className="size-4 text-stone-300 group-hover:text-stone-500" />
                    </Link>
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

function RequiredHint({ grades }: { grades: GradeSummaryDto }) {
  const r = grades.required.result;
  if (r.status === 'needed') {
    const risky = r.value > 14;
    return (
      <p className={`text-xs ${risky ? 'font-medium text-amber-800' : 'text-stone-500'}`}>
        Para passar precisas de {formatGrade(r.value, 1)} no que falta
      </p>
    );
  }
  if (r.status === 'secured') return <p className="text-xs text-green-700">Aprovação garantida (cumprindo mínimos)</p>;
  if (r.status === 'impossible')
    return <p className="text-xs font-medium text-red-700">Já não é possível passar nesta época</p>;
  return null;
}
