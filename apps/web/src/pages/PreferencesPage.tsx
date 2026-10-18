import { studyPreferencesSchema } from '@studentos/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, ErrorState, FormError, IconButton, LoadingList, PageHeader, TextField } from '../components/ui';
import { useSaveStudyPreferences, useStudyPreferences } from '../hooks/queries';
import { ApiError, errorMessage } from '../lib/api';
import type { StudyPreferencesView } from '../lib/types';

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const toTime = (minute: number) =>
  minute >= 1440
    ? '24:00'
    : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const toMinute = (time: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

interface WindowRow {
  key: number;
  weekday: number;
  start: string;
  end: string;
}

/** Preferências de estudo e disponibilidade semanal (spec §7.7). */
export function PreferencesPage() {
  const prefs = useStudyPreferences();

  return (
    <>
      <PageHeader
        title="Preferências de estudo"
        subtitle="O plano de estudo usa estas regras. São preferências, não obrigações: o plano avisa quando não as consegue cumprir."
      />
      {prefs.error ? (
        <ErrorState message={errorMessage(prefs.error)} onRetry={() => prefs.refetch()} />
      ) : prefs.isPending ? (
        <LoadingList rows={4} />
      ) : (
        <PreferencesForm initial={prefs.data} />
      )}
    </>
  );
}

let rowKey = 0;

function PreferencesForm({ initial }: { initial: StudyPreferencesView }) {
  const save = useSaveStudyPreferences();
  const [rows, setRows] = useState<WindowRow[]>(() =>
    initial.availability.map((w) => ({
      key: rowKey++,
      weekday: w.weekday,
      start: toTime(w.startMinute),
      end: toTime(w.endMinute),
    })),
  );
  const [numbers, setNumbers] = useState({
    sessionMinutes: String(initial.sessionMinutes),
    minSessionMinutes: String(initial.minSessionMinutes),
    breakMinutes: String(initial.breakMinutes),
    maxDailyMinutes: String(initial.maxDailyMinutes),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function addPreset(weekdays: number[], start: string, end: string) {
    setRows((r) => [...r, ...weekdays.map((weekday) => ({ key: rowKey++, weekday, start, end }))]);
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const body = {
      sessionMinutes: Number(numbers.sessionMinutes),
      minSessionMinutes: Number(numbers.minSessionMinutes),
      breakMinutes: Number(numbers.breakMinutes),
      maxDailyMinutes: Number(numbers.maxDailyMinutes),
      availability: rows.map((r) => ({
        weekday: r.weekday,
        startMinute: toMinute(r.start),
        endMinute: toMinute(r.end),
      })),
    };
    const parsed = studyPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync(parsed.data);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setErrors(err.fieldErrors());
    }
  }

  const number = (key: keyof typeof numbers, label: string, hint?: string) => (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      value={numbers[key]}
      onChange={(e) => setNumbers((n) => ({ ...n, [key]: e.target.value }))}
      error={errors[key]}
      hint={hint}
    />
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Card title="Quando posso estudar">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => addPreset([1, 2, 3, 4, 5], '18:00', '21:00')}>
              <Plus aria-hidden="true" className="size-4" />
              Dias úteis 18:00–21:00
            </Button>
            <Button variant="secondary" onClick={() => addPreset([6, 7], '10:00', '13:00')}>
              <Plus aria-hidden="true" className="size-4" />
              Fim de semana 10:00–13:00
            </Button>
          </div>
          {WEEKDAYS.map((label, i) => {
            const weekday = i + 1;
            const dayRows = rows.filter((r) => r.weekday === weekday);
            return (
              <fieldset key={weekday} className="border-t border-stone-100 pt-3">
                <legend className="text-sm font-medium text-stone-800">{label}</legend>
                <div className="mt-2 space-y-2">
                  {dayRows.length === 0 && <p className="text-xs text-stone-500">Sem períodos de estudo.</p>}
                  {dayRows.map((r) => (
                    <div key={r.key} className="flex flex-wrap items-end gap-2">
                      <TextField
                        label="Das"
                        type="time"
                        value={r.start}
                        onChange={(e) =>
                          setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, start: e.target.value } : x)))
                        }
                        className="w-32"
                      />
                      <TextField
                        label="Às"
                        type="time"
                        value={r.end === '24:00' ? '23:59' : r.end}
                        onChange={(e) =>
                          setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, end: e.target.value } : x)))
                        }
                        className="w-32"
                      />
                      <IconButton
                        label={`Remover período de ${label.toLowerCase()} ${r.start}–${r.end}`}
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        className="mb-0.5 hover:text-red-700"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </IconButton>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRows((rs) => [...rs, { key: rowKey++, weekday, start: '18:00', end: '20:00' }])}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    + Adicionar período
                  </button>
                </div>
              </fieldset>
            );
          })}
          <FormError message={errors.availability ?? null} />
          <p className="text-xs text-stone-500">
            O plano nunca marca estudo por cima de aulas ou eventos ocupados do{' '}
            <Link to="/calendario" className="underline">
              calendário
            </Link>
            .
          </p>
        </div>
      </Card>

      <Card title="Sessões">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {number('sessionMinutes', 'Duração habitual (min)', 'Ex.: 25, 50 ou 75')}
          {number('minSessionMinutes', 'Duração mínima (min)')}
          {number('breakMinutes', 'Pausa entre sessões (min)')}
          {number('maxDailyMinutes', 'Máximo por dia (min)')}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && (
          <p role="status" className="text-sm text-green-700">
            Preferências guardadas.{' '}
            <Link to="/plano" className="underline">
              Gerar plano
            </Link>
          </p>
        )}
        <FormError
          message={
            save.error && !(save.error instanceof ApiError && save.error.details.length)
              ? errorMessage(save.error)
              : null
          }
        />
        <Button type="submit" loading={save.isPending}>
          Guardar preferências
        </Button>
      </div>
    </form>
  );
}
