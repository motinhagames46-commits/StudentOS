import { useQueryClient } from '@tanstack/react-query';
import type { AvailabilityWindowInput } from '@studentos/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AssessmentsStep,
  AvailabilityStep,
  DisciplinesStep,
  SessionsStep,
  WelcomeStep,
} from '../components/onboarding/OnboardingSteps';
import { WeekResultStep } from '../components/onboarding/WeekResultStep';
import { FullPageSpinner } from '../components/RequireAuth';
import { useMe } from '../hooks/useAuth';

const STEP_TITLES = ['Bem-vindo', 'Disciplinas', 'Avaliações', 'Horas livres', 'Sessões', 'A tua semana'];
const QUESTION_STEPS = 4;

/**
 * Boas-vindas (spec §3.2, percurso A): quatro perguntas que alimentam modelos reais (disciplinas,
 * avaliações, disponibilidade, preferências) e terminam no plano da semana gerado pelo planeador.
 * Cada passo grava logo pelos endpoints autenticados; qualquer passo pode ser saltado.
 */
export function OnboardingPage() {
  const { data: me, isPending } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [availability, setAvailability] = useState<AvailabilityWindowInput[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Ao mudar de passo, o foco vai para o título (leitores de ecrã anunciam o novo passo).
  useEffect(() => {
    if (step > 0) headingRef.current?.focus();
  }, [step]);

  if (isPending || !me) return <FullPageSpinner />;

  const next = () => setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  const finish = () => {
    void queryClient.invalidateQueries();
    void navigate('/', { replace: true });
  };

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <img src="/favicon.svg" alt="" className="size-6" />
            StudentOS
          </span>
          {step < STEP_TITLES.length - 1 && (
            <button type="button" onClick={finish} className="text-sm text-stone-600 underline hover:text-stone-900">
              Saltar e ir para o painel
            </button>
          )}
        </div>

        {step > 0 && step <= QUESTION_STEPS && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium tracking-wide text-stone-600 uppercase">
              Passo {step} de {QUESTION_STEPS} · {STEP_TITLES[step]}
            </p>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-stone-200"
              role="progressbar"
              aria-label="Progresso do questionário"
              aria-valuemin={0}
              aria-valuemax={QUESTION_STEPS}
              aria-valuenow={step}
            >
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${(step / QUESTION_STEPS) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-8">
          {step === 0 && <WelcomeStep name={me.user.name.split(' ')[0] ?? me.user.name} onStart={next} />}
          {step === 1 && <DisciplinesStep headingRef={headingRef} semester={me.activeSemester} onDone={next} />}
          {step === 2 && <AssessmentsStep headingRef={headingRef} onDone={next} />}
          {step === 3 && (
            <AvailabilityStep
              headingRef={headingRef}
              semester={me.activeSemester}
              onDone={(windows) => {
                setAvailability(windows);
                next();
              }}
            />
          )}
          {step === 4 && <SessionsStep headingRef={headingRef} availability={availability} onDone={next} />}
          {step === 5 && <WeekResultStep headingRef={headingRef} onFinish={finish} onBack={() => setStep(3)} />}
        </div>

        {step > 1 && step <= QUESTION_STEPS && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="mt-4 text-sm text-stone-600 underline hover:text-stone-900"
          >
            Voltar ao passo anterior
          </button>
        )}
      </div>
    </main>
  );
}
