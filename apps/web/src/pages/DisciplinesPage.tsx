import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { DisciplineForm } from '../components/DisciplineForm';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { useCreateDiscipline, useDisciplines } from '../hooks/queries';
import { useMe } from '../hooks/useAuth';
import { errorMessage } from '../lib/api';
import { formatGrade, gradeStatusLabels } from '../lib/format';
import { gradeTone } from './DashboardPage';

/** Lista de disciplinas (RF04). */
export function DisciplinesPage() {
  const { data: me } = useMe();
  const { data, isPending, error, refetch } = useDisciplines();
  const create = useCreateDiscipline();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Disciplinas"
        subtitle={me?.activeSemester?.label}
        action={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Nova disciplina
            </Button>
          )
        }
      />

      {creating && (
        <Card title="Nova disciplina" className="mb-4">
          <DisciplineForm
            onSubmit={async (v) => {
              const d = await create.mutateAsync(v);
              setCreating(false);
              navigate(`/disciplinas/${d.id}`);
            }}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data.length === 0 ? (
        !creating && (
          <EmptyState
            message="Ainda não tens disciplinas."
            action={<Button onClick={() => setCreating(true)}>Criar disciplina</Button>}
          />
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((d) => (
            <li key={d.id}>
              <Link
                to={`/disciplinas/${d.id}`}
                className="flex h-full overflow-hidden rounded-xl border border-stone-200 bg-white transition-shadow hover:shadow-sm"
              >
                <span aria-hidden="true" className="w-1.5 shrink-0" style={{ backgroundColor: d.color ?? '#a8a29e' }} />
                <div className="flex flex-1 items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-stone-500">{d.code}</p>
                    <p className="truncate text-base font-medium text-stone-900">{d.name}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <Badge tone={gradeTone(d.grades.status)}>{gradeStatusLabels[d.grades.status]}</Badge>
                      {d.ects && <span>{d.ects} ECTS</span>}
                      <span>
                        {d.pendingTasks} {d.pendingTasks === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold tabular-nums text-stone-900">
                      {formatGrade(d.grades.finalGrade ?? d.grades.currentAverage, 1)}
                    </p>
                    <p className="text-xs text-stone-500">{d.grades.finalGrade !== null ? 'nota final' : 'média atual'}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
