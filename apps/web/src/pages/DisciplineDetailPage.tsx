import { Archive, ArchiveRestore, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AbsencesCard } from '../components/AbsencesCard';
import { AssessmentSection } from '../components/AssessmentSection';
import { DisciplineForm } from '../components/DisciplineForm';
import { GradeSimulator } from '../components/GradeSimulator';
import { TaskList } from '../components/TaskList';
import { Badge, Button, Card, ErrorState, LoadingList, Skeleton } from '../components/ui';
import { useDeleteDiscipline, useDiscipline, useTasks, useUpdateDiscipline, useUpdateTask } from '../hooks/queries';
import { ApiError, errorMessage } from '../lib/api';
import { formatGrade } from '../lib/format';
import { GradeStatusBadge } from '../components/GradeStatusBadge';

/** Detalhe da disciplina: avaliações, médias e simulador de nota necessária (RF07–RF09). */
export function DisciplineDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data: d, isPending, error, refetch } = useDiscipline(id);
  const tasks = useTasks({ disciplineId: id, status: 'TODO', sort: 'dueDate' });
  const update = useUpdateDiscipline();
  const remove = useDeleteDiscipline();
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState(false);

  if (error) {
    return error instanceof ApiError && error.status === 404 ? (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message="Disciplina não encontrada." />
      </div>
    ) : (
      <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
    );
  }
  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  async function handleDelete() {
    if (!d) return;
    const content = d.assessments.length || d.pendingTasks;
    const ok = window.confirm(
      content
        ? `Eliminar "${d.name}" de forma permanente?\n\n• ${d.assessments.length} avaliação(ões) e as notas registadas serão apagadas.\n• As tarefas ficam sem disciplina.\n\nSe só já não a frequentas, usa "Arquivar": o histórico fica guardado.`
        : `Eliminar "${d.name}"?`,
    );
    if (!ok) return;
    await remove.mutateAsync(d.id);
    navigate('/disciplinas', { replace: true });
  }

  const g = d.grades;

  return (
    <div className="space-y-4">
      <BackLink />

      {editing ? (
        <Card title="Editar disciplina">
          <DisciplineForm
            initial={d}
            submitLabel="Guardar"
            onSubmit={async (v) => {
              await update.mutateAsync({ id: d.id, ...v });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 h-10 w-1.5 rounded-full"
              style={{ backgroundColor: d.color ?? '#a8a29e' }}
            />
            <div>
              <p className="text-xs font-semibold tracking-wide text-stone-600">
                {d.code}
                {d.ects ? ` · ${d.ects} ECTS` : ''}
                {d.semester ? ` · ${d.semester.label}` : ''}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{d.name}</h1>
              {d.archivedAt && <Badge>Arquivada</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" className="size-4" />
              Editar
            </Button>
            <Button
              variant="secondary"
              loading={update.isPending}
              onClick={() => update.mutate({ id: d.id, archived: !d.archivedAt })}
            >
              {d.archivedAt ? (
                <ArchiveRestore aria-hidden="true" className="size-4" />
              ) : (
                <Archive aria-hidden="true" className="size-4" />
              )}
              {d.archivedAt ? 'Reativar' : 'Arquivar'}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={remove.isPending}>
              <Trash2 aria-hidden="true" className="size-4" />
              Eliminar
            </Button>
          </div>
        </header>
      )}

      <dl className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
          <dt className="text-xs text-stone-500">Média atual</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
            {formatGrade(g.currentAverage, 1)}
          </dd>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
          <dt className="text-xs text-stone-500">Nota final</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{formatGrade(g.finalGrade)}</dd>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
          <dt className="text-xs text-stone-500">Estado</dt>
          <dd className="mt-2">
            <GradeStatusBadge grades={g} passingGrade={d.passingGrade} />
          </dd>
        </div>
      </dl>

      <Card title="Quanto preciso?">
        <GradeSimulator key={d.id} assessments={d.assessments} passingGrade={d.passingGrade} />
      </Card>

      <Card title="Avaliações">
        <AssessmentSection discipline={d} />
      </Card>

      <AbsencesCard key={d.id} discipline={d} />

      <Card title="Tarefas pendentes">
        {tasks.isPending ? (
          <LoadingList />
        ) : (
          <TaskList
            tasks={tasks.data ?? []}
            onToggle={(t) => updateTask.mutate(t)}
            emptyMessage="Sem tarefas pendentes nesta disciplina."
            compact
          />
        )}
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/disciplinas" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
      <ArrowLeft aria-hidden="true" className="size-4" />
      Disciplinas
    </Link>
  );
}
