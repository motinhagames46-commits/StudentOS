import {
  DEFAULT_TIMEZONE,
  blockKinds,
  scheduleBlockCreateSchema,
  zonedToInstant,
  type BlockKind,
} from '@studentos/shared';
import { useState, type FormEvent } from 'react';
import { useCreateBlock, useDisciplines } from '../hooks/queries';
import { useMe } from '../hooks/useAuth';
import { ApiError, errorMessage } from '../lib/api';
import { blockKindLabels, isoToDateOnly } from '../lib/format';
import { Button, FormError, SelectField, TextField } from './ui';

function toIso(day: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  return zonedToInstant(+d[1]!, +d[2]!, +d[3]!, +t[1]!, +t[2]!, DEFAULT_TIMEZONE).toISOString();
}

/**
 * Criação manual de aulas e eventos (com repetição semanal opcional). `commitment` prepara um compromisso fixo
 * (trabalho, treino…): semanal até ao fim do semestre e ocupado, para o planeador não marcar estudo por cima.
 */
export function BlockForm({ onDone, commitment = false }: { onDone: () => void; commitment?: boolean }) {
  const create = useCreateBlock();
  const disciplines = useDisciplines();
  const semesterEnd = useMe().data?.activeSemester?.endDate;
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<BlockKind>(commitment ? 'OTHER' : 'CLASS');
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [repeatUntil, setRepeatUntil] = useState(commitment && semesterEnd ? isoToDateOnly(semesterEnd) : '');
  const [location, setLocation] = useState('');
  const [disciplineId, setDisciplineId] = useState('');
  const [isBusy, setIsBusy] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const startAt = toIso(day, start);
    const endAt = toIso(day, end);
    const fieldErrors: Record<string, string> = {};
    if (!day) fieldErrors.day = 'Indica o dia';
    if (!startAt) fieldErrors.start = 'Indica a hora de início';
    if (!endAt) fieldErrors.end = 'Indica a hora de fim';
    if (Object.keys(fieldErrors).length) return setErrors(fieldErrors);

    const parsed = scheduleBlockCreateSchema.safeParse({
      title,
      kind,
      startAt,
      endAt,
      repeatWeeklyUntil: repeatUntil || null,
      location: location || null,
      disciplineId: disciplineId ? Number(disciplineId) : null,
      isBusy,
    });
    if (!parsed.success) {
      const map: Record<string, string> = { endAt: 'end', startAt: 'start', repeatWeeklyUntil: 'repeat' };
      setErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [map[String(i.path[0])] ?? String(i.path[0]), i.message])),
      );
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await create.mutateAsync(parsed.data);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setFormError(err.details.map((d) => d.message).join(' · '));
      else setFormError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <TextField
          label="Título"
          placeholder={commitment ? 'Ex.: Trabalho, treino' : 'Ex.: Programação Web (T)'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          autoFocus
        />
        <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>
          {blockKinds.map((k) => (
            <option key={k} value={k}>
              {blockKindLabels[k]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField label="Dia" type="date" value={day} onChange={(e) => setDay(e.target.value)} error={errors.day} />
        <TextField
          label="Início"
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          error={errors.start}
        />
        <TextField label="Fim" type="time" value={end} onChange={(e) => setEnd(e.target.value)} error={errors.end} />
        <TextField
          label="Repetir até"
          type="date"
          value={repeatUntil}
          onChange={(e) => setRepeatUntil(e.target.value)}
          error={errors.repeat}
          hint="Opcional: semanalmente"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Local" value={location} onChange={(e) => setLocation(e.target.value)} />
        <SelectField label="Disciplina" value={disciplineId} onChange={(e) => setDisciplineId(e.target.value)}>
          <option value="">Sem disciplina</option>
          {disciplines.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </SelectField>
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={isBusy} onChange={(e) => setIsBusy(e.target.checked)} />
        Ocupado: o planeador de estudo não marca sessões por cima
      </label>
      <FormError message={formError} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Adicionar
        </Button>
      </div>
    </form>
  );
}
