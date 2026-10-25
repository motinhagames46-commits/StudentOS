import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Copy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useDisciplines } from '../hooks/queries';
import { ApiError, api, errorMessage } from '../lib/api';
import { formatTime } from '../lib/format';
import { Button, Card, EmptyState, FormError, LoadingList, TextField } from './ui';

interface CreatedTransfer {
  code: string;
  expiresAt: string;
  disciplines: { id: number; code: string; name: string }[];
}

interface TransferPreview {
  from: { name: string };
  expiresAt: string;
  disciplines: { id: number; code: string; name: string; semester: string | null; assessments: number }[];
  counts: {
    disciplines: number;
    assessments: number;
    tasks: number;
    classes: number;
    plannedSessions: number;
    studySessions: number;
  };
  duplicates: { tasks: number; classes: number };
  conflicts: string[];
  conflictMessage: string | null;
}

/**
 * Transferir disciplinas para outra conta do mesmo estudante (por exemplo, outro email):
 * esta conta gera um código de uso único; a outra conta cola-o, vê o que muda e confirma.
 */
export function TransferCard() {
  return (
    <Card title="Transferir disciplinas para outra conta">
      <div className="grid gap-6 md:grid-cols-2">
        <SendSection />
        <ReceiveSection />
      </div>
    </Card>
  );
}

function SendSection() {
  const disciplines = useDisciplines();
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [includeClasses, setIncludeClasses] = useState(true);
  const [created, setCreated] = useState<CreatedTransfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const all = disciplines.data ?? [];
  const chosen = selected ?? new Set(all.map((d) => d.id));

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      setCreated(
        await api<CreatedTransfer>('/transfers', {
          method: 'POST',
          body: { disciplineIds: [...chosen], includeUnlinkedBlocks: includeClasses },
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="transfer-send" className="space-y-3 text-sm">
      <h3 id="transfer-send" className="font-medium text-stone-900">
        Enviar desta conta
      </h3>
      {disciplines.isPending ? (
        <LoadingList rows={2} />
      ) : all.length === 0 ? (
        <EmptyState message="Esta conta não tem disciplinas ativas para transferir." />
      ) : created ? (
        <div className="space-y-2 rounded-lg bg-accent-soft p-3 text-accent-ink">
          <p>Na outra conta, abre Conta → Transferir disciplinas → Receber, e cola este código:</p>
          <p className="flex items-center gap-2">
            <span className="font-mono text-2xl font-semibold tracking-widest" aria-label="Código gerado">
              {created.code}
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(created.code).then(() => setCopied(true));
              }}
            >
              <Copy aria-hidden="true" className="size-4" />
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </p>
          <p className="text-xs">
            Válido até às {formatTime(created.expiresAt)}, uma só vez. Disciplinas:{' '}
            {created.disciplines.map((d) => d.code).join(', ')}.
          </p>
        </div>
      ) : (
        <>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-stone-600">Disciplinas a transferir</legend>
            {all.map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen.has(d.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(d.id);
                    else next.delete(d.id);
                    setSelected(next);
                  }}
                />
                <span>
                  {d.code} — {d.name}
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={includeClasses}
              onChange={(e) => setIncludeClasses(e.target.checked)}
            />
            <span>Incluir também as aulas do horário que não estão ligadas a nenhuma disciplina</span>
          </label>
          <p className="text-xs text-stone-500">
            As avaliações e notas, as tarefas, as aulas e as sessões de estudo destas disciplinas passam para a outra
            conta e saem desta.
          </p>
          <FormError message={error} />
          <Button onClick={generate} loading={busy} disabled={chosen.size === 0}>
            <ArrowRightLeft aria-hidden="true" className="size-4" />
            Gerar código
          </Button>
        </>
      )}
    </section>
  );
}

function ReceiveSection() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [done, setDone] = useState<TransferPreview['counts'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'accept' | null>(null);

  async function look(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setBusy('preview');
    try {
      setPreview(await api<TransferPreview>('/transfers/preview', { method: 'POST', body: { code } }));
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError && err.details.length ? err.details[0]!.message : errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function accept() {
    setError(null);
    setBusy('accept');
    try {
      const result = await api<{ counts: TransferPreview['counts'] }>('/transfers/accept', {
        method: 'POST',
        body: { code },
      });
      setDone(result.counts);
      setPreview(null);
      setCode('');
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="transfer-receive" className="space-y-3 text-sm">
      <h3 id="transfer-receive" className="font-medium text-stone-900">
        Receber nesta conta
      </h3>
      <form onSubmit={look} className="flex flex-wrap items-end gap-2">
        <TextField
          label="Código de transferência"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          className="w-48"
        />
        <Button type="submit" variant="secondary" loading={busy === 'preview'} disabled={code.trim().length < 8}>
          Ver o que vem
        </Button>
      </form>
      <FormError message={error} />
      {done && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-green-900">
          Transferência concluída: {done.disciplines} disciplina(s), {done.assessments} avaliação(ões), {done.tasks}{' '}
          tarefa(s) e {done.classes} aula(s) estão agora nesta conta.
        </p>
      )}
      {preview && (
        <div className="space-y-2 rounded-lg border border-stone-200 p-3">
          <p>
            Da conta de <strong>{preview.from.name}</strong>:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {preview.disciplines.map((d) => (
              <li key={d.id}>
                {d.code} — {d.name}
                {d.semester ? ` (${d.semester})` : ''} · {d.assessments} avaliação(ões)
              </li>
            ))}
          </ul>
          <p className="text-stone-600">
            Também: {preview.counts.tasks} tarefa(s), {preview.counts.classes} aula(s), {preview.counts.plannedSessions}{' '}
            sessão(ões) planeada(s) e {preview.counts.studySessions} sessão(ões) de estudo.
            {preview.duplicates.classes + preview.duplicates.tasks > 0 &&
              ` ${preview.duplicates.classes + preview.duplicates.tasks} item(ns) importado(s) já existem aqui e não são duplicados.`}
          </p>
          {preview.conflictMessage && <FormError message={preview.conflictMessage} />}
          <Button onClick={accept} loading={busy === 'accept'} disabled={preview.conflicts.length > 0}>
            Transferir para esta conta
          </Button>
        </div>
      )}
    </section>
  );
}
