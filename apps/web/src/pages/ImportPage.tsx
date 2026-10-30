import {
  MAX_IMPORT_BYTES,
  csvFields,
  type CsvField,
  type DateFormat,
  type ImportCounts,
  type ImportItem,
  type ImportJobView,
} from '@studentos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Info, XCircle } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormError,
  LoadingList,
  PageHeader,
  SelectField,
  TextField,
} from '../components/ui';
import { useConfirm } from '../components/ConfirmDialog';
import { useDisciplines } from '../hooks/queries';
import { useMe } from '../hooks/useAuth';
import { api, ApiError, errorMessage } from '../lib/api';
import { blockKindLabels, formatDateTime, isoToZonedInput, zonedInputToIso } from '../lib/format';

const fieldLabels: Record<CsvField, string> = {
  title: 'Título',
  date: 'Data',
  startTime: 'Hora de início',
  endTime: 'Hora de fim',
  weekday: 'Dia da semana',
  location: 'Local/sala',
  discipline: 'Disciplina',
  recurrence: 'Repetição',
  description: 'Descrição',
  ignore: '— ignorar —',
};

const statusLabels: Record<ImportJobView['status'], string> = {
  NEEDS_REVIEW: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  FAILED: 'Falhou',
  EXPIRED: 'Expirada',
};

interface LoadedFile {
  kind: 'ICS' | 'CSV';
  filename: string;
  content: string;
}

interface CsvOptionsState {
  mapping?: Record<string, CsvField>;
  dateFormat?: DateFormat;
  validFrom?: string;
  validUntil?: string;
}

/** Importação de horários com pré-visualização editável e confirmação explícita (spec §8.2). */
export function ImportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [job, setJob] = useState<ImportJobView | null>(null);
  const [result, setResult] = useState<ImportCounts | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputId = useId();

  const history = useQuery({ queryKey: ['imports'], queryFn: () => api<ImportJobView[]>('/imports') });

  const analyse = useMutation({
    mutationFn: async ({ loaded, csv }: { loaded: LoadedFile; csv?: CsvOptionsState }) => {
      if (job && job.status === 'NEEDS_REVIEW')
        await api<void>(`/imports/${job.id}`, { method: 'DELETE' }).catch(() => {});
      return api<ImportJobView>('/imports', { method: 'POST', body: { ...loaded, ...(csv ? { csv } : {}) } });
    },
    onSuccess: (data) => {
      setJob(data);
      setResult(null);
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext !== 'ics' && ext !== 'csv') {
      setFileError('Escolhe um ficheiro .ics ou .csv');
      return;
    }
    if (f.size > MAX_IMPORT_BYTES) {
      setFileError('O ficheiro excede 1 MB');
      return;
    }
    const loaded: LoadedFile = { kind: ext === 'ics' ? 'ICS' : 'CSV', filename: f.name, content: await f.text() };
    setFile(loaded);
    analyse.mutate({ loaded });
  }

  function reset() {
    setFile(null);
    setJob(null);
    setResult(null);
    analyse.reset();
  }

  return (
    <>
      <PageHeader
        title="Importar horário"
        subtitle="Carrega um ficheiro, revê o que foi detetado e só depois confirma. Nada é gravado sem a tua confirmação."
      />

      {result ? (
        <ImportResult counts={result} onAnother={reset} />
      ) : job && file ? (
        <ImportReview
          key={job.id}
          job={job}
          reanalysing={analyse.isPending}
          reanalyseError={analyse.error ? errorMessage(analyse.error) : null}
          onReanalyse={(csv) => analyse.mutate({ loaded: file, csv })}
          onCancel={async () => {
            await api<void>(`/imports/${job.id}`, { method: 'DELETE' }).catch(() => {});
            void queryClient.invalidateQueries({ queryKey: ['imports'] });
            reset();
          }}
          onDone={(counts) => {
            setResult(counts);
            setJob(null);
            void queryClient.invalidateQueries();
          }}
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <FileUp aria-hidden="true" className="size-8 text-stone-400" />
              <label
                htmlFor={inputId}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
              >
                Escolher ficheiro .ics ou .csv
                <input
                  id={inputId}
                  type="file"
                  accept=".ics,.csv,text/calendar,text/csv"
                  className="sr-only"
                  onChange={handleFile}
                />
              </label>
              <p className="text-xs text-stone-500">
                Máximo 1 MB. O ficheiro não é guardado: só os itens que confirmares.
              </p>
              {analyse.isPending && <p className="text-sm text-stone-600">A analisar…</p>}
              <FormError message={fileError ?? (analyse.error ? errorMessage(analyse.error) : null)} />
            </div>
          </Card>
          <HowToExport />
        </div>
      )}

      <Card title="Importações recentes" className="mt-6">
        {history.error ? (
          <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
        ) : history.isPending ? (
          <LoadingList rows={2} />
        ) : history.data.length === 0 ? (
          <EmptyState message="Ainda não importaste nenhum ficheiro." />
        ) : (
          <ImportHistory jobs={history.data} />
        )}
      </Card>
    </>
  );
}

function HowToExport() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Ficheiro .ics (Moodle, Outlook, Google)">
        <ul className="space-y-2 text-sm text-stone-700">
          <li>
            <strong>Moodle:</strong> Calendário → <em>Exportar calendário</em> → escolhe os eventos e o período →{' '}
            <em>Exportar</em>. Os prazos de entregas são importados como tarefas.
          </li>
          <li>
            <strong>Outlook (web):</strong> Definições → Calendário → <em>Calendários partilhados</em> →{' '}
            <em>Publicar um calendário</em> → descarrega o link .ics. No Outlook para computador: Ficheiro →{' '}
            <em>Guardar calendário</em>.
          </li>
          <li>
            <strong>Google Calendar:</strong> Definições → <em>Importar e exportar</em> → <em>Exportar</em>.
          </li>
        </ul>
        <p className="mt-3 flex gap-2 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
          <Info aria-hidden="true" className="size-4 shrink-0" />A ligação direta ao Moodle e ao Outlook ainda não está
          disponível: depende de autorização do IPVC e da Microsoft.{' '}
          <Link to="/integracoes" className="underline">
            Saber mais
          </Link>
        </p>
      </Card>
      <Card title="Folha de horário (.csv)">
        <p className="text-sm text-stone-700">
          Uma linha por aula ou evento. Colunas reconhecidas automaticamente (podes ajustar a seguir):
        </p>
        <p className="mt-2 rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-700">
          Disciplina;Dia;Início;Fim;Sala
          <br />
          PW;segunda;10:00;12:00;B2.04
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Também aceita colunas Título, Data (aaaa-mm-dd ou dd/mm/aaaa), Local e Descrição. Separador «;» ou «,».
        </p>
      </Card>
    </div>
  );
}

function ImportReview({
  job,
  reanalysing,
  reanalyseError,
  onReanalyse,
  onCancel,
  onDone,
}: {
  job: ImportJobView;
  reanalysing: boolean;
  reanalyseError: string | null;
  onReanalyse: (csv: CsvOptionsState) => void;
  onCancel: () => void;
  onDone: (counts: ImportCounts) => void;
}) {
  const { data: me } = useMe();
  const disciplines = useDisciplines();
  const [items, setItems] = useState<ImportItem[]>(job.items);
  const [csv, setCsv] = useState<CsvOptionsState>(() => ({
    mapping: job.csv?.mapping,
    dateFormat: job.csv && !job.csv.dateFormatAmbiguous ? job.csv.dateFormat : undefined,
    validFrom: job.csv?.validFrom ?? me?.activeSemester?.startDate.slice(0, 10),
    validUntil: job.csv?.validUntil ?? me?.activeSemester?.endDate.slice(0, 10),
  }));
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = items.filter((i) => i.action !== 'skip');
  const needsDateFormat = job.csv?.dateFormatAmbiguous === true;
  const needsMapping = (job.csv?.missingFields.length ?? 0) > 0;
  const needsPeriod = items.some((i) => i.issues.some((x) => /período das aulas|até quando/.test(x.message)));

  const update = (key: string, patch: Partial<ImportItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function confirm() {
    setConfirmError(null);
    setSubmitting(true);
    try {
      const body = {
        items: items.map((i) => ({
          key: i.key,
          action: i.action,
          title: i.title || undefined,
          kind: i.kind,
          startAt: i.startAt ?? undefined,
          endAt: i.endAt ?? undefined,
          location: i.location,
          disciplineId: i.disciplineId,
          isBusy: i.isBusy,
        })),
      };
      const res = await api<{ counts: ImportCounts }>(`/imports/${job.id}/confirm`, { method: 'POST', body });
      onDone(res.counts);
    } catch (err) {
      if (err instanceof ApiError && err.details.length) {
        setConfirmError(err.details.map((d) => `Item ${d.path.replace('items.', '')}: ${d.message}`).join(' · '));
      } else setConfirmError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title={`Pré-visualização — ${job.originalFilename}`}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{job.counts?.total ?? 0} itens</Badge>
            <Badge tone="green">{job.counts?.ready ?? 0} prontos</Badge>
            {job.counts?.duplicates ? <Badge tone="amber">{job.counts.duplicates} duplicados</Badge> : null}
            {job.counts?.errors ? <Badge tone="red">{job.counts.errors} com erros</Badge> : null}
          </div>
          {job.warnings.map((w) => (
            <p key={w} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {w}
            </p>
          ))}
          <p className="text-xs text-stone-500">
            Expira às {formatDateTime(job.expiresAt)}. Os horários são apresentados na hora de Portugal continental.
          </p>
        </div>
      </Card>

      {job.csv && (
        <Card title="Opções do CSV">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {job.csv.headers.map((h) => (
                <SelectField
                  key={h}
                  label={`Coluna «${h}»`}
                  value={csv.mapping?.[h] ?? 'ignore'}
                  onChange={(e) =>
                    setCsv((c) => ({ ...c, mapping: { ...(c.mapping ?? {}), [h]: e.target.value as CsvField } }))
                  }
                >
                  {csvFields.map((f) => (
                    <option key={f} value={f}>
                      {fieldLabels[f]}
                    </option>
                  ))}
                </SelectField>
              ))}
            </div>
            {needsMapping && (
              <p role="alert" className="text-sm text-red-700">
                Falta associar: {job.csv.missingFields.map((f) => fieldLabels[f]).join(', ')}.
              </p>
            )}
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-stone-700">
                Formato das datas{' '}
                {needsDateFormat && <span className="text-red-700">(obrigatório: há datas ambíguas)</span>}
              </legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ['DMY', 'dia/mês/ano (ex.: 05/11 = 5 de novembro)'],
                    ['MDY', 'mês/dia/ano (ex.: 05/11 = 11 de maio)'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="dateFormat"
                      checked={csv.dateFormat === value}
                      onChange={() => setCsv((c) => ({ ...c, dateFormat: value }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Aulas semanais de"
                type="date"
                value={csv.validFrom ?? ''}
                onChange={(e) => setCsv((c) => ({ ...c, validFrom: e.target.value || undefined }))}
                hint="Usado quando o ficheiro indica o dia da semana em vez da data"
              />
              <TextField
                label="até"
                type="date"
                value={csv.validUntil ?? ''}
                onChange={(e) => setCsv((c) => ({ ...c, validUntil: e.target.value || undefined }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => onReanalyse(csv)} loading={reanalysing}>
                Atualizar pré-visualização
              </Button>
              {(needsDateFormat || needsPeriod) && (
                <span className="text-sm text-stone-600">
                  Atualiza a pré-visualização depois de escolher as opções.
                </span>
              )}
            </div>
            <FormError message={reanalyseError} />
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState message="Não há itens para importar com as opções atuais." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <ImportItemCard
              key={item.key}
              item={item}
              disciplines={disciplines.data ?? []}
              onChange={(patch) => update(item.key, patch)}
            />
          ))}
        </ul>
      )}

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm md:bottom-4">
        <p className="text-sm text-stone-700">
          <strong>{selected.length}</strong> de {items.length} selecionados para importar
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            onClick={confirm}
            loading={submitting}
            disabled={selected.length === 0 || (needsDateFormat && !csv.dateFormat) || needsMapping}
          >
            Importar {selected.length}
          </Button>
        </div>
        {needsDateFormat && (
          <p className="w-full text-xs text-red-700">Escolhe o formato das datas e atualiza a pré-visualização.</p>
        )}
        <div className="w-full">
          <FormError message={confirmError} />
        </div>
      </div>
    </div>
  );
}

function ImportItemCard({
  item,
  disciplines,
  onChange,
}: {
  item: ImportItem;
  disciplines: { id: number; code: string; name: string }[];
  onChange: (patch: Partial<ImportItem>) => void;
}) {
  const hasError = item.issues.some((i) => i.severity === 'error');
  const included = item.action !== 'skip';
  const checkboxId = useId();

  return (
    <li
      className={`rounded-xl border bg-white p-4 ${hasError ? 'border-red-200' : included ? 'border-stone-200' : 'border-stone-200 opacity-75'}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-1 size-4"
          checked={included}
          disabled={hasError}
          onChange={(e) =>
            onChange({
              action: e.target.checked ? (item.duplicate?.reason === 'external' ? 'update' : 'create') : 'skip',
            })
          }
        />
        <label htmlFor={checkboxId} className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={item.target === 'task' ? 'accent' : 'neutral'}>
              {item.target === 'task' ? 'Tarefa (prazo)' : blockKindLabels[item.kind]}
            </Badge>
            {item.recurrenceSummary && <span className="text-xs text-stone-500">{item.recurrenceSummary}</span>}
            {!item.isBusy && item.target === 'block' && (
              <span className="text-xs text-stone-500">não bloqueia estudo</span>
            )}
          </span>
          <span className="mt-1 block text-sm font-medium text-stone-900">{item.title || '(sem título)'}</span>
        </label>
        {item.duplicate && item.duplicate.reason === 'external' && (
          <SelectField
            label="Ação"
            value={item.action}
            onChange={(e) => onChange({ action: e.target.value as ImportItem['action'] })}
            className="w-44"
          >
            <option value="skip">Ignorar</option>
            <option value="update">Atualizar o existente</option>
          </SelectField>
        )}
      </div>

      {item.duplicate && <p className="mt-2 text-xs text-amber-800">{item.duplicate.label}</p>}
      {item.issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {item.issues.map((issue, n) => (
            <li
              key={n}
              className={`flex items-start gap-1.5 text-xs ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-800'}`}
            >
              {issue.severity === 'error' ? (
                <XCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              ) : (
                <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              )}
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {included && !hasError && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Título" value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
          <TextField
            label={item.target === 'task' ? 'Prazo' : 'Início'}
            type="datetime-local"
            value={isoToZonedInput(item.startAt)}
            onChange={(e) => {
              const iso = zonedInputToIso(e.target.value);
              if (iso) onChange(item.target === 'task' ? { startAt: iso, endAt: iso } : { startAt: iso });
            }}
          />
          {item.target === 'block' && (
            <TextField
              label="Fim"
              type="datetime-local"
              value={isoToZonedInput(item.endAt)}
              onChange={(e) => {
                const iso = zonedInputToIso(e.target.value);
                if (iso) onChange({ endAt: iso });
              }}
            />
          )}
          <SelectField
            label="Disciplina"
            value={item.disciplineId ?? ''}
            onChange={(e) => onChange({ disciplineId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Sem disciplina</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </SelectField>
          {item.target === 'block' && (
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={item.isBusy} onChange={(e) => onChange({ isBusy: e.target.checked })} />
              Ocupado (o planeador não marca estudo por cima)
            </label>
          )}
        </div>
      )}
    </li>
  );
}

function ImportResult({ counts, onAnother }: { counts: ImportCounts; onAnother: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 aria-hidden="true" className="size-10 text-green-600" />
        <p className="text-lg font-semibold text-stone-900">Importação concluída</p>
        <p className="text-sm text-stone-600">
          {counts.created ?? 0} criados · {counts.updated ?? 0} atualizados · {counts.skipped ?? 0} ignorados
          {counts.failed ? ` · ${counts.failed} falharam` : ''}
        </p>
        <div className="flex gap-2">
          <Link
            to="/calendario"
            className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Ver no calendário
          </Link>
          <Button variant="secondary" onClick={onAnother}>
            Importar outro ficheiro
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ImportHistory({ jobs }: { jobs: ImportJobView[] }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const undo = useMutation({
    mutationFn: (id: string) => api<{ removed: number }>(`/imports/${id}/data`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  async function undoImport(j: ImportJobView) {
    const ok = await confirm({
      title: `Anular a importação de «${j.originalFilename}»?`,
      message: 'As aulas e tarefas que ela criou são apagadas.',
      confirmLabel: 'Anular importação',
    });
    if (ok) undo.mutate(j.id);
  }

  return (
    <>
      <ul className="divide-y divide-stone-100">
        {jobs.map((j) => (
          <li key={j.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-stone-900">{j.originalFilename}</p>
              <p className="text-xs text-stone-500">
                {formatDateTime(j.createdAt)} · {statusLabels[j.status]}
                {j.counts?.created !== undefined && ` · ${j.counts.created} criados`}
                {j.counts?.removed !== undefined && ` · anulada (${j.counts.removed} removidos)`}
              </p>
            </div>
            {j.status === 'CONFIRMED' && j.counts?.removed === undefined && (
              <Button
                variant="secondary"
                loading={undo.isPending && undo.variables === j.id}
                onClick={() => void undoImport(j)}
              >
                Anular importação
              </Button>
            )}
          </li>
        ))}
      </ul>
      <FormError message={undo.error ? errorMessage(undo.error) : null} />
    </>
  );
}
