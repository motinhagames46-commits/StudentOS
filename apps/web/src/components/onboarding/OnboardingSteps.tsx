import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarClock, ClipboardList, Plus, Timer, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useDisciplines } from '../../hooks/queries';
import { ApiError, api, errorMessage } from '../../lib/api';
import { dateOnlyToIso, isoToDateOnly } from '../../lib/format';
import { ASSESSMENT_TEMPLATES } from '../../lib/onboarding';
import type { Semester } from '../../lib/types';
import { Button, FormError, IconButton, LoadingList, SelectField, TextField } from '../ui';
import { StepActions, StepHeader, type HeadingRef } from './StepParts';

export { AvailabilityStep, SessionsStep } from './PreferenceSteps';
// ---------------------------------------------------------------------------------------------------

export function WelcomeStep({ name, onStart }: { name: string; onStart: () => void }) {
  const items: { icon: ReactNode; text: string }[] = [
    {
      icon: <BookOpen aria-hidden="true" className="size-5" />,
      text: 'As tuas disciplinas e os créditos ECTS de cada uma — para saber quanto tempo pedem.',
    },
    {
      icon: <ClipboardList aria-hidden="true" className="size-5" />,
      text: 'Como é avaliada cada uma — para calcular médias e a nota de que precisas.',
    },
    {
      icon: <CalendarClock aria-hidden="true" className="size-5" />,
      text: 'Quando podes estudar — o plano nunca marca nada fora disso nem por cima das aulas.',
    },
    {
      icon: <Timer aria-hidden="true" className="size-5" />,
      text: 'Como gostas de estudar — sessões curtas ou longas, com pausas.',
    },
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Olá, {name}! Que bom ter-te aqui.</h1>
      <p className="mt-2 text-stone-700">
        Em cerca de 3 minutos montamos o teu semestre e a tua <strong>primeira semana de estudo</strong>. Só perguntamos
        o que o plano usa:
      </p>
      <ul className="mt-5 space-y-3">
        {items.map((i) => (
          <li key={i.text} className="flex gap-3 text-sm text-stone-700">
            <span className="mt-0.5 shrink-0 text-accent">{i.icon}</span>
            {i.text}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-stone-600">Podes saltar qualquer passo e mudar tudo mais tarde.</p>
      <div className="mt-8 flex justify-end">
        <Button onClick={onStart}>Vamos a isso</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------

interface DisciplineRow {
  key: number;
  name: string;
  code: string;
  ects: string;
}
let rowKey = 0;
const emptyRow = (): DisciplineRow => ({ key: rowKey++, name: '', code: '', ects: '' });

export function DisciplinesStep({
  headingRef,
  semester,
  onDone,
}: {
  headingRef: HeadingRef;
  semester: Semester | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const existing = useDisciplines();
  const [rows, setRows] = useState<DisciplineRow[]>(() => [emptyRow()]);
  const [start, setStart] = useState(semester ? isoToDateOnly(semester.startDate) : '');
  const [end, setEnd] = useState(semester ? isoToDateOnly(semester.endDate) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (key: number, field: keyof Omit<DisciplineRow, 'key'>, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const filled = rows.filter((r) => r.name.trim() || r.code.trim() || r.ects.trim());
    const errs: Record<string, string> = {};
    for (const r of filled) {
      if (!r.name.trim()) errs[`${r.key}.name`] = 'Indica o nome';
      if (!r.code.trim()) errs[`${r.key}.code`] = 'Indica a sigla';
      if (r.ects.trim() && !(Number.isInteger(Number(r.ects)) && Number(r.ects) >= 1 && Number(r.ects) <= 60))
        errs[`${r.key}.ects`] = 'Entre 1 e 60';
    }
    if (semester && start && end && end <= start) errs.end = 'O fim tem de ser depois do início';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setFormError(null);
    try {
      if (
        semester &&
        start &&
        end &&
        (start !== isoToDateOnly(semester.startDate) || end !== isoToDateOnly(semester.endDate))
      ) {
        await api(`/semesters/${semester.id}`, {
          method: 'PATCH',
          body: { startDate: dateOnlyToIso(start), endDate: dateOnlyToIso(end) },
        });
      }
      for (const r of filled) {
        await api('/disciplines', {
          method: 'POST',
          body: { name: r.name.trim(), code: r.code.trim(), ...(r.ects.trim() ? { ects: Number(r.ects) } : {}) },
        });
        // Já gravada: sai da lista, para tentar de novo não a duplicar se uma seguinte falhar.
        setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [emptyRow()]));
      }
      await queryClient.invalidateQueries();
      onDone();
    } catch (err) {
      void queryClient.invalidateQueries();
      setFormError(err instanceof ApiError && err.details.length ? err.details[0]!.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <StepHeader
        headingRef={headingRef}
        title="Que disciplinas tens este semestre?"
        why="Os ECTS são os créditos de cada unidade curricular (UC): 1 ECTS corresponde a 25–28 horas de trabalho. Encontra-los na ficha da UC ou no plano de estudos do curso; se não souberes, deixa em branco."
      />
      {semester && (
        <fieldset className="mb-6 grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium text-stone-700">Semestre ({semester.label})</legend>
          <TextField label="Começa a" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField
            label="Acaba a"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            error={errors.end}
          />
        </fieldset>
      )}
      {existing.data && existing.data.length > 0 && (
        <p className="mb-4 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
          Já tens: {existing.data.map((d) => `${d.code}${d.ects ? ` (${d.ects} ECTS)` : ''}`).join(', ')}. Acrescenta só
          as que faltam.
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[1fr_6rem_5rem_auto] items-end gap-2">
            <TextField
              label={i === 0 ? 'Nome da disciplina' : `Nome da disciplina ${i + 1}`}
              placeholder="ex.: Programação Web"
              value={r.name}
              onChange={(e) => update(r.key, 'name', e.target.value)}
              error={errors[`${r.key}.name`]}
            />
            <TextField
              label={i === 0 ? 'Sigla' : `Sigla ${i + 1}`}
              placeholder="PW"
              value={r.code}
              onChange={(e) => update(r.key, 'code', e.target.value)}
              error={errors[`${r.key}.code`]}
            />
            <TextField
              label={i === 0 ? 'ECTS' : `ECTS ${i + 1}`}
              inputMode="numeric"
              placeholder="6"
              value={r.ects}
              onChange={(e) => update(r.key, 'ects', e.target.value)}
              error={errors[`${r.key}.ects`]}
            />
            <IconButton
              label={`Remover a linha ${i + 1}`}
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [emptyRow()]))}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" className="mt-3" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
        <Plus aria-hidden="true" className="size-4" />
        Outra disciplina
      </Button>
      <FormError message={formError} />
      <StepActions saving={saving} skip={onDone} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------

export function AssessmentsStep({ headingRef, onDone }: { headingRef: HeadingRef; onDone: () => void }) {
  const queryClient = useQueryClient();
  const disciplines = useDisciplines();
  const pending = (disciplines.data ?? []).filter((d) => d.assessments.length === 0);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      for (const d of pending) {
        const template = ASSESSMENT_TEMPLATES.find((t) => t.id === (choice[d.id] ?? 'teste-exame'));
        for (const item of template?.items ?? []) {
          await api(`/disciplines/${d.id}/assessments`, { method: 'POST', body: item });
        }
      }
      await queryClient.invalidateQueries();
      onDone();
    } catch (err) {
      // Recarrega as disciplinas: as que já receberam avaliações deixam de aparecer (não se duplicam).
      void queryClient.invalidateQueries();
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <StepHeader
        headingRef={headingRef}
        title="Como é avaliada cada disciplina?"
        why="Escolhe o modelo mais parecido. Com isto calculamos a tua média de 0 a 20 (a nota final arredonda às unidades: 9,5 já é 10) e a nota de que precisas; acertas pesos e datas depois, na disciplina."
      />
      {disciplines.isPending ? (
        <LoadingList rows={3} />
      ) : pending.length === 0 ? (
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
          {disciplines.data?.length
            ? 'Todas as tuas disciplinas já têm avaliações. Podes continuar.'
            : 'Ainda não tens disciplinas: podes continuar e acrescentá-las depois.'}
        </p>
      ) : (
        <div className="space-y-4">
          {pending.map((d) => (
            <SelectField
              key={d.id}
              label={`${d.code} — ${d.name}`}
              value={choice[d.id] ?? 'teste-exame'}
              onChange={(e) => setChoice((c) => ({ ...c, [d.id]: e.target.value }))}
            >
              {ASSESSMENT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
              <option value="mais-tarde">Ainda não sei (defino depois)</option>
            </SelectField>
          ))}
          <p className="text-xs text-stone-600">
            Sem data marcada, o plano reparte o estudo até ao fim do semestre, ao ritmo dos ECTS da disciplina.
          </p>
        </div>
      )}
      <FormError message={formError} />
      <StepActions saving={saving} skip={onDone} />
    </form>
  );
}
