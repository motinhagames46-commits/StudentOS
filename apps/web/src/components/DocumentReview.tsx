// Revisão das datas propostas pela IA: nada é gravado sem confirmação, e cada item é validado no browser e no servidor.
import {
  assessmentTypes,
  documentConfirmItemSchema,
  type DocumentConfirmItem,
  type StudyDocumentView,
} from '@studentos/shared';
import { useId, useState } from 'react';
import { useConfirmDocument, useDisciplines } from '../hooks/queries';
import { ApiError, errorMessage } from '../lib/api';
import { assessmentTypeLabels, formatDate } from '../lib/format';
import type { Discipline } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { Badge, Button, Card, ErrorState, FormError, LoadingList, SelectField, TextField } from './ui';

interface Row extends DocumentConfirmItem {
  include: boolean;
  evidence: string;
  duplicate: boolean;
  /** Números como texto enquanto se escreve («40,» não pode virar 40). */
  weightText: string;
  minScoreText: string;
}

const toNumber = (value: string) => (value.trim() === '' ? null : Number(value.replace(',', '.')));
type RowErrors = Partial<Record<keyof DocumentConfirmItem, string>>;

/** Datas propostas por rever. Inclui as disciplinas arquivadas: a do documento pode ter sido arquivada entretanto. */
export function DocumentReview({ doc }: { doc: StudyDocumentView }) {
  const active = useDisciplines();
  const archived = useDisciplines(undefined, true);
  if (active.error || archived.error) {
    return <ErrorState message={errorMessage(active.error ?? archived.error)} />;
  }
  if (!active.data || !archived.data) return <LoadingList rows={2} />;
  return <ReviewCard key={doc.id} doc={doc} disciplines={[...active.data, ...archived.data]} />;
}

function ReviewCard({ doc, disciplines }: { doc: StudyDocumentView; disciplines: Discipline[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const save = useConfirmDocument(doc.id);
  const [rows, setRows] = useState<Row[]>(() =>
    doc.proposals.map((p) => ({
      // Mudar a data de uma avaliação que já tem data fica por marcar: a IA pode ter lido mal.
      include: !p.duplicate && !p.match?.date,
      evidence: p.evidence,
      duplicate: p.duplicate,
      target: p.target,
      title: p.title,
      date: p.date,
      time: p.time,
      disciplineId: doc.disciplineId,
      assessmentType: p.assessmentType,
      weight: p.weight,
      minScore: p.minScore,
      weightText: p.weight === null ? '' : String(p.weight).replace('.', ','),
      minScoreText: p.minScore === null ? '' : String(p.minScore).replace('.', ','),
      assessmentId: p.match?.id ?? null,
    })),
  );
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const chosen = rows.flatMap((row, i) => (row.include ? [i] : []));

  async function submit(indices: number[]) {
    setFormError(null);
    const found: Record<number, RowErrors> = {};
    const items: DocumentConfirmItem[] = [];
    for (const i of indices) {
      const {
        include: _include,
        evidence: _evidence,
        duplicate: _duplicate,
        weightText,
        minScoreText,
        ...item
      } = rows[i]!;
      const parsed = documentConfirmItemSchema.safeParse({
        ...item,
        weight: toNumber(weightText),
        minScore: toNumber(minScoreText),
      });
      if (parsed.success) items.push(parsed.data);
      else found[i] = Object.fromEntries(parsed.error.issues.map((x) => [x.path[0], x.message]));
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      const result = await save.mutateAsync(items);
      const parts = [
        result.created && `${result.created} ${result.created === 1 ? 'criada' : 'criadas'}`,
        result.updated && `${result.updated} ${result.updated === 1 ? 'atualizada' : 'atualizadas'}`,
      ].filter(Boolean);
      toast({ message: parts.length ? `Gravado: ${parts.join(', ')}.` : 'Datas ignoradas.' });
    } catch (err) {
      // Erros por item (ex.: soma dos pesos) voltam com o índice na lista enviada.
      const details = err instanceof ApiError ? (err.details ?? []) : [];
      const mapped: Record<number, RowErrors> = {};
      for (const detail of details) {
        const [, index, field] = detail.path.split('.');
        const row = indices[Number(index)];
        if (row !== undefined && field) mapped[row] = { ...mapped[row], [field]: detail.message };
      }
      setErrors(mapped);
      setFormError(errorMessage(err));
    }
  }

  async function ignoreAll() {
    const ok = await confirm({
      title: 'Ignorar todas as datas?',
      message: 'Nada é gravado e a revisão deste documento fica fechada. O texto transcrito continua disponível.',
      confirmLabel: 'Ignorar todas',
      tone: 'primary',
    });
    if (ok) await submit([]);
  }

  return (
    <Card title="Datas encontradas" action={<Badge tone="amber">Por rever</Badge>}>
      <p className="mb-4 text-sm text-stone-600">
        A IA pode enganar-se: confirma cada data com o documento. Só fica gravado o que marcares.
      </p>
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <ProposalRow
            key={i}
            row={row}
            errors={errors[i] ?? {}}
            disciplines={disciplines}
            onChange={(patch) => update(i, patch)}
          />
        ))}
      </ol>
      <FormError message={formError} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={save.isPending} disabled={chosen.length === 0} onClick={() => void submit(chosen)}>
          {chosen.length === 1 ? 'Gravar 1 selecionada' : `Gravar ${chosen.length} selecionadas`}
        </Button>
        <Button variant="secondary" disabled={save.isPending} onClick={() => void ignoreAll()}>
          Ignorar todas
        </Button>
      </div>
    </Card>
  );
}

function ProposalRow({
  row,
  errors,
  disciplines,
  onChange,
}: {
  row: Row;
  errors: RowErrors;
  disciplines: Discipline[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const assessments = disciplines.find((d) => d.id === row.disciplineId)?.assessments ?? [];
  const evidenceId = useId();
  const isNew = row.target === 'assessment' && row.assessmentId === null;

  return (
    <li className="rounded-lg border border-stone-200 p-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={row.include}
          aria-describedby={row.evidence ? evidenceId : undefined}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium text-stone-900">
          {row.title || 'Sem título'}
          {row.duplicate && <Badge>Já existe</Badge>}
        </span>
      </label>
      {row.evidence && (
        <p id={evidenceId} className="mt-0.5 ml-8 text-xs text-stone-500 italic">
          «{row.evidence}»
        </p>
      )}

      {row.include && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Gravar como"
            value={row.target}
            onChange={(e) => onChange({ target: e.target.value as Row['target'] })}
          >
            <option value="assessment">Avaliação</option>
            <option value="task">Tarefa</option>
          </SelectField>
          <TextField
            label="Título"
            value={row.title}
            error={errors.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <TextField
            label="Data"
            type="date"
            value={row.date ?? ''}
            error={errors.date}
            onChange={(e) => onChange({ date: e.target.value || null })}
          />
          <TextField
            label="Hora (opcional)"
            type="time"
            value={row.time ?? ''}
            error={errors.time}
            onChange={(e) => onChange({ time: e.target.value || null })}
          />
          <SelectField
            label="Disciplina"
            value={row.disciplineId ?? ''}
            error={errors.disciplineId}
            onChange={(e) =>
              onChange({ disciplineId: e.target.value ? Number(e.target.value) : null, assessmentId: null })
            }
          >
            <option value="">Sem disciplina</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
                {d.archivedAt ? ' (arquivada)' : ''}
              </option>
            ))}
          </SelectField>
          {row.target === 'assessment' && (
            <SelectField
              label="Avaliação"
              value={row.assessmentId ?? ''}
              onChange={(e) => onChange({ assessmentId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Nova avaliação</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  Atualizar a data de «{a.name}» ({a.weight}%{a.date ? `, atual ${formatDate(a.date)}` : ', sem data'})
                </option>
              ))}
            </SelectField>
          )}
          {isNew && (
            <>
              <SelectField
                label="Tipo"
                value={row.assessmentType}
                onChange={(e) => onChange({ assessmentType: e.target.value as Row['assessmentType'] })}
              >
                {assessmentTypes.map((type) => (
                  <option key={type} value={type}>
                    {assessmentTypeLabels[type]}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Peso (%)"
                inputMode="decimal"
                value={row.weightText}
                error={errors.weight}
                onChange={(e) => onChange({ weightText: e.target.value })}
              />
              <TextField
                label="Nota mínima (opcional)"
                inputMode="decimal"
                value={row.minScoreText}
                error={errors.minScore}
                onChange={(e) => onChange({ minScoreText: e.target.value })}
              />
            </>
          )}
        </div>
      )}
    </li>
  );
}
