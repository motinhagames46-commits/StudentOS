import type { AvailabilityWindowInput } from '@studentos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useStudyPreferences } from '../../hooks/queries';
import { ApiError, api, errorMessage } from '../../lib/api';
import {
  SESSION_PRESETS,
  STUDY_PERIODS,
  WEEKDAY_LABELS,
  availabilityFromChoices,
  weeklyAvailableMinutes,
} from '../../lib/onboarding';
import { FormError, SelectField } from '../ui';
import { StepActions, StepHeader, type HeadingRef } from './StepParts';

// Passos 3 e 4 do questionário: disponibilidade e preferências de sessão (alimentam o planeador).
export function AvailabilityStep({
  headingRef,
  onDone,
}: {
  headingRef: HeadingRef;
  onDone: (windows: AvailabilityWindowInput[] | null) => void;
}) {
  const prefs = useStudyPreferences();
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [periods, setPeriods] = useState<string[]>(['fim-tarde']);
  const [keep, setKeep] = useState<boolean | null>(null);
  const hasExisting = (prefs.data?.availability.length ?? 0) > 0;
  const keepExisting = keep ?? hasExisting;
  const minutes = weeklyAvailableMinutes(days, periods);

  const toggle = (list: number[] | string[], value: number | string) =>
    (list as (number | string)[]).includes(value)
      ? (list as (number | string)[]).filter((v) => v !== value)
      : [...list, value];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(keepExisting ? null : availabilityFromChoices(days, periods));
      }}
      noValidate
    >
      <StepHeader
        headingRef={headingRef}
        title="Quando podes estudar?"
        why="O plano só marca sessões nestas horas e nunca por cima das tuas aulas. É uma preferência: mudas quando quiseres."
      />
      {hasExisting && (
        <label className="mb-4 flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={keepExisting} onChange={(e) => setKeep(e.target.checked)} />
          Manter a disponibilidade que já definiste
        </label>
      )}
      {!keepExisting && (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">Dias</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, i) => (
                <label
                  key={label}
                  className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    checked={days.includes(i + 1)}
                    onChange={() => setDays(toggle(days, i + 1) as number[])}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium text-stone-700">Períodos</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {STUDY_PERIODS.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    checked={periods.includes(p.id)}
                    onChange={() => setPeriods(toggle(periods, p.id) as string[])}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-sm text-stone-700" aria-live="polite">
            Até <strong>{Math.round(minutes / 60)} h por semana</strong> para estudar (antes de descontar aulas).
          </p>
        </>
      )}
      <StepActions saving={false} skip={() => onDone(null)} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------

const DAILY_OPTIONS = [60, 120, 180, 240];

export function SessionsStep({
  headingRef,
  availability,
  onDone,
}: {
  headingRef: HeadingRef;
  availability: AvailabilityWindowInput[] | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const prefs = useStudyPreferences();
  const [preset, setPreset] = useState('50-10');
  const [daily, setDaily] = useState(120);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const chosen = SESSION_PRESETS.find((p) => p.id === preset) ?? SESSION_PRESETS[1]!;
    setSaving(true);
    setFormError(null);
    try {
      await api('/preferences/study', {
        method: 'PUT',
        body: {
          sessionMinutes: chosen.sessionMinutes,
          minSessionMinutes: Math.min(25, chosen.sessionMinutes),
          breakMinutes: chosen.breakMinutes,
          maxDailyMinutes: daily,
          availability: availability ?? prefs.data?.availability ?? [],
        },
      });
      await queryClient.invalidateQueries();
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError && err.details.length ? err.details[0]!.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <StepHeader
        headingRef={headingRef}
        title="Como gostas de estudar?"
        why="Sessões com pausas rendem mais do que horas seguidas. O limite diário evita planos impossíveis."
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Duração das sessões</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SESSION_PRESETS.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent-soft"
            >
              <input
                type="radio"
                name="sessao"
                value={p.id}
                checked={preset === p.id}
                onChange={() => setPreset(p.id)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <SelectField
        className="mt-5 max-w-xs"
        label="Máximo de estudo por dia"
        value={String(daily)}
        onChange={(e) => setDaily(Number(e.target.value))}
      >
        {DAILY_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m / 60} h
          </option>
        ))}
      </SelectField>
      <FormError message={formError} />
      <StepActions saving={saving} label="Ver a minha semana" />
    </form>
  );
}
