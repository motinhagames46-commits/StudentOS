import { DEFAULT_PLANNER_PREFERENCES, DEFAULT_TIMEZONE, addDaysToKey, zonedDayKey } from '@studentos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useStudyPreferences } from '../../hooks/queries';
import { ApiError, api, errorMessage } from '../../lib/api';
import { STUDY_PERIODS, availabilityFromChoices, commitmentBlock, weeklyAvailableMinutes } from '../../lib/onboarding';
import { WEEKDAY_LABELS, isoToDateOnly } from '../../lib/format';
import type { Semester } from '../../lib/types';
import { CommitmentsField, commitmentErrors, type CommitmentRow } from './CommitmentsField';
import { FormError } from '../ui';
import { StepActions, StepHeader, type HeadingRef } from './StepParts';

// Passo 3 do questionário: disponibilidade (alimenta o planeador). A duração das sessões fica a predefinida, e
// muda-se em Preferências (conselho de 2026-11-02: menos um ecrã antes do primeiro plano).
export function AvailabilityStep({
  headingRef,
  semester,
  onDone,
}: {
  headingRef: HeadingRef;
  semester: Semester | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const prefs = useStudyPreferences();
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    const windows = keepExisting ? null : availabilityFromChoices(days, periods);
    const errs = commitmentErrors(commitments);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const today = zonedDayKey(new Date(), DEFAULT_TIMEZONE);
    const semesterEnd = semester ? isoToDateOnly(semester.endDate) : '';
    // Até ao fim do semestre; sem semestre (ou já terminado), meio ano.
    const until = semesterEnd > today ? semesterEnd : addDaysToKey(today, 182);
    setSaving(true);
    setFormError(null);
    try {
      for (const c of commitments) {
        await api('/schedule-blocks', { method: 'POST', body: commitmentBlock(c, today, until) });
        // Já gravado: sai da lista, para tentar de novo não o duplicar.
        setCommitments((rs) => rs.filter((x) => x.key !== c.key));
      }
      if (windows) {
        // As horas livres gravam-se com as preferências de sessão que já existem (numa conta nova, as predefinidas).
        const base = prefs.data ?? DEFAULT_PLANNER_PREFERENCES;
        await api('/preferences/study', {
          method: 'PUT',
          body: {
            sessionMinutes: base.sessionMinutes,
            minSessionMinutes: base.minSessionMinutes,
            breakMinutes: base.breakMinutes,
            maxDailyMinutes: base.maxDailyMinutes,
            availability: windows,
          },
        });
      }
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
        title="Quando podes estudar?"
        why="O plano só marca sessões nestas horas e nunca por cima das tuas aulas nem dos compromissos fixos. É uma preferência: mudas quando quiseres."
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
      <CommitmentsField rows={commitments} onChange={setCommitments} errors={errors} />
      <FormError message={formError} />
      <StepActions saving={saving} skip={onDone} label="Ver a minha semana" />
    </form>
  );
}
