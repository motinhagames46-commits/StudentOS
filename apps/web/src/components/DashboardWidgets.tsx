import { isAtRisk } from '@studentos/shared';
import {
  AlarmClock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ClipboardList,
  GraduationCap,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useStudyPreferences } from '../hooks/queries';
import { formatDuration, formatGrade } from '../lib/format';
import type { Dashboard } from '../lib/types';
import { Card } from './ui';

interface Tile {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: 'danger';
  hint: ReactNode;
}

const hintLink = 'font-medium text-accent hover:underline';

/** Linha de estatísticas ao estilo tile_count do Gentelella. Sem setas ▲/▼: não há período de comparação. */
export function StatTiles({ data, studyMinutes }: { data: Dashboard; studyMinutes: number | null }) {
  const { average, credits } = data.globalAverage;
  // Mesma regra do selo «Em risco» das disciplinas.
  const risky = data.disciplines.filter((d) => isAtRisk(d.grades, d.passingGrade)).length;
  const tiles: Tile[] = [
    {
      icon: ClipboardList,
      label: 'Tarefas esta semana',
      value: String(data.upcomingTasks.length),
      hint: 'nos próximos 7 dias',
    },
    {
      icon: AlarmClock,
      label: 'Em atraso',
      value: String(data.overdueTasks.length),
      tone: data.overdueTasks.length > 0 ? 'danger' : undefined,
      hint: data.overdueTasks.length ? (
        <Link to="/tarefas" className={hintLink}>
          Ver tarefas
        </Link>
      ) : (
        'Tudo em dia'
      ),
    },
    {
      icon: GraduationCap,
      label: 'Média (aprovadas)',
      value: formatGrade(average, 1),
      hint: credits ? `${credits} ECTS aprovados` : 'Sem disciplinas concluídas',
    },
    {
      icon: Timer,
      label: 'Estudo (7 dias)',
      value: studyMinutes === null ? '—' : formatDuration(studyMinutes * 60000),
      hint:
        studyMinutes === 0 ? (
          <Link to="/sessoes" className={hintLink}>
            Iniciar uma sessão
          </Link>
        ) : (
          'registado no modo foco'
        ),
    },
    {
      icon: AlertTriangle,
      label: 'Disciplinas em risco',
      value: String(risky),
      tone: risky > 0 ? 'danger' : undefined,
      hint: risky ? 'média atual abaixo da nota para passar' : 'Nenhuma de momento',
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-y-4 rounded-lg border border-panel-border bg-white py-4 shadow-[0_1px_4px_rgba(42,63,84,0.06)] sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map(({ icon: Icon, label, value, tone, hint }) => (
        <div key={label} className="px-4 lg:border-l lg:border-panel-border lg:first:border-l-0">
          <dt className="flex items-center gap-1.5 text-[13px] text-[#566A80]">
            <Icon aria-hidden="true" className="size-4 text-[#7B8794]" />
            {label}
          </dt>
          <dd
            className={`mt-1 text-3xl font-semibold tabular-nums ${tone === 'danger' ? 'text-[#C0392B]' : 'text-stone-800'}`}
          >
            {value}
          </dd>
          <dd className="mt-0.5 text-xs text-[#566A80]">{hint}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lista do que falta para o plano funcionar; desaparece quando está tudo feito. */
export function SetupProgress({ data }: { data: Dashboard }) {
  const prefs = useStudyPreferences();
  if (!prefs.data) return null;
  const ds = data.disciplines;
  const steps = [
    { label: 'Disciplinas do semestre', done: ds.length > 0 },
    { label: 'ECTS de cada disciplina', done: ds.length > 0 && ds.every((d) => d.ects) },
    { label: 'Avaliações com pesos a 100 %', done: ds.length > 0 && ds.every((d) => d.grades.weightSum === 100) },
    { label: 'Horas livres para estudar', done: prefs.data.availability.length > 0 },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <Card title="Continuar configuração">
      <p className="text-sm text-stone-700">
        Faltam {steps.length - done} de {steps.length} passos para o plano de estudo e as médias funcionarem a sério.
      </p>
      <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            {s.done ? (
              <CheckCircle2 aria-hidden="true" className="size-4 text-brand-text" />
            ) : (
              <Circle aria-hidden="true" className="size-4 text-[#7B8794]" />
            )}
            <span className={s.done ? 'text-stone-500 line-through' : 'text-stone-800'}>{s.label}</span>
            <span className="sr-only">{s.done ? '(feito)' : '(por fazer)'}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/boas-vindas"
        className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Continuar configuração
      </Link>
    </Card>
  );
}
