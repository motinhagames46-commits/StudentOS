import { useId, useState } from 'react';
import { GradeSimulator } from '../GradeSimulator';

/** Demonstração na página de entrada: o simulador real, com uma disciplina de exemplo. Corre só no browser. */
export function LandingDemo() {
  const [test, setTest] = useState('8');
  const testId = useId();
  const parsed = Number(test.replace(',', '.'));
  const valid = test.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 20;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 md:p-6">
      <p className="text-xs font-medium tracking-wide text-accent uppercase">Experimenta já</p>
      <h2 className="mt-1 text-lg font-semibold text-stone-900">Quanto precisas no exame?</h2>
      <p className="mt-1 text-sm text-stone-600">
        Disciplina de exemplo: teste com 40 % e exame com 60 % (mínimo 8). A nota final arredonda às unidades, por isso
        passar é chegar a 9,5.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor={testId} className="text-sm font-medium text-stone-700">
          Tive no teste
        </label>
        <input
          id={testId}
          type="number"
          inputMode="decimal"
          min={0}
          max={20}
          step={0.5}
          value={test}
          onChange={(e) => setTest(e.target.value)}
          className="min-h-10 w-24 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
        <span className="text-sm text-stone-600">valores</span>
      </div>

      <div className="mt-4">
        {valid ? (
          <GradeSimulator
            passingGrade={10}
            assessments={[
              { name: 'Teste', weight: 40, score: parsed },
              { name: 'Exame', weight: 60, score: null, minScore: 8 },
            ]}
          />
        ) : (
          <p aria-live="polite" className="rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-800">
            Indica a nota do teste, entre 0 e 20.
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-stone-600">Calculado no teu browser: nada é enviado nem guardado.</p>
    </div>
  );
}
