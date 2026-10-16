import { requiredScore, type GradeItem } from '@studentos/shared';
import { useId, useState } from 'react';
import { formatGrade } from '../lib/format';

interface GradeSimulatorProps {
  assessments: (GradeItem & { name: string })[];
  passingGrade: number;
}

/** Simulador de nota necessária (RF09 / HU03). Calcula no cliente com o mesmo motor da API. */
export function GradeSimulator({ assessments, passingGrade }: GradeSimulatorProps) {
  const [target, setTarget] = useState(String(passingGrade));
  const inputId = useId();

  const parsed = Number(target.replace(',', '.'));
  const validTarget = target.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 20;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="text-sm font-medium text-stone-700">
          Nota que quero
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={0}
          max={20}
          step={0.5}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="min-h-10 w-24 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <div className="flex gap-1">
          {[passingGrade, 14, 16].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTarget(String(v))}
              className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
            >
              {formatGrade(v)}
            </button>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-800">
        {validTarget ? <SimulatorMessage assessments={assessments} target={parsed} passingGrade={passingGrade} /> : 'Indica uma nota entre 0 e 20.'}
      </p>
    </div>
  );
}

function SimulatorMessage({
  assessments,
  target,
  passingGrade,
}: GradeSimulatorProps & { target: number }) {
  const result = requiredScore(assessments, target);
  const goal = target === passingGrade ? 'Para passar' : `Para teres ${formatGrade(target)}`;

  switch (result.status) {
    case 'incomplete-config':
      return <>Configura as avaliações até os pesos somarem 100% para usar o simulador.</>;
    case 'no-pending':
      return <>Todas as avaliações já têm nota.</>;
    case 'secured':
      return (
        <>
          <strong>Já tens {formatGrade(target)} garantido</strong>, desde que cumpras as notas mínimas.
        </>
      );
    case 'impossible':
      return result.reason === 'failed-minimum' ? (
        <>Uma componente ficou abaixo da nota mínima: a disciplina já não pode ser aprovada nesta época.</>
      ) : (
        <>
          <strong>Não é possível atingir {formatGrade(target)}</strong> com as avaliações que faltam.
        </>
      );
    case 'needed': {
      const pending = assessments.filter((a) => a.score === null);
      const withoutMinimums = requiredScore(
        assessments.map((a) => ({ ...a, minScore: null })),
        target,
      );
      const byMinimum = withoutMinimums.status !== 'needed' || withoutMinimums.value < result.value;
      const where =
        pending.length === 1
          ? `na avaliação «${pending[0]!.name}»`
          : `em média nas ${pending.length} avaliações pendentes`;
      return (
        <>
          {goal} precisas de <strong className="text-base">{formatGrade(result.value, 1)}</strong> {where}
          {byMinimum && ' (nota mínima)'}.
        </>
      );
    }
  }
}
