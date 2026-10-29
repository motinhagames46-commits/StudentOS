import { DOCUMENT_MAX_BYTES, DOCUMENT_MAX_FILES } from '@studentos/shared';
import { Camera, FileText, Upload, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AiUnavailable } from '../components/AiUnavailable';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  DisciplineChip,
  EmptyState,
  ErrorState,
  FormError,
  IconButton,
  LoadingList,
  PageHeader,
  SelectField,
  Skeleton,
} from '../components/ui';
import { useAiStatus, useCreateDocument, useDisciplines, useDocuments } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { decodedBytes, toUploadFile } from '../lib/files';
import { formatDate } from '../lib/format';

const kb = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Documentos lidos pela IA: fotografar ou carregar, e a lista do que já foi lido. */
export function DocumentsPage() {
  const ai = useAiStatus();
  const documents = useDocuments();
  const disciplines = useDisciplines();
  const byId = new Map((disciplines.data ?? []).map((d) => [d.id, d]));

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Fotografa ou carrega apontamentos, enunciados e calendários de avaliação. A IA transcreve o texto e encontra datas; tu decides o que fica gravado."
      />
      <div className="space-y-4">
        {ai.isPending ? (
          <Skeleton className="h-40" />
        ) : ai.data?.status === 'ENABLED' ? (
          <UploadCard />
        ) : (
          <AiUnavailable status={ai.data?.status} action="ler documentos" />
        )}

        <Card title="Os teus documentos">
          {documents.error ? (
            <ErrorState message={errorMessage(documents.error)} onRetry={() => void documents.refetch()} />
          ) : documents.isPending ? (
            <LoadingList rows={2} />
          ) : documents.data.length === 0 ? (
            <EmptyState message="Ainda não tens documentos." />
          ) : (
            <ul className="-my-2 divide-y divide-stone-100">
              {documents.data.map((doc) => {
                const discipline = doc.disciplineId ? byId.get(doc.disciplineId) : undefined;
                return (
                  <li key={doc.id}>
                    <Link
                      to={`/documentos/${doc.id}`}
                      className="flex min-h-12 items-center gap-3 py-2 hover:bg-stone-50 focus-visible:-outline-offset-2"
                    >
                      <FileText aria-hidden="true" className="size-5 shrink-0 text-stone-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-900">{doc.title}</span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          {formatDate(doc.createdAt)} · {doc.pageCount === 1 ? '1 página' : `${doc.pageCount} páginas`}
                          {discipline && <DisciplineChip discipline={discipline} />}
                        </span>
                      </span>
                      {doc.status === 'PROCESSING' && <Badge>A ler…</Badge>}
                      {doc.status === 'FAILED' && <Badge tone="red">Falhou</Badge>}
                      {doc.pendingProposals > 0 && (
                        <Badge tone="amber">
                          {doc.pendingProposals === 1 ? '1 data por rever' : `${doc.pendingProposals} datas por rever`}
                        </Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function UploadCard() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateDocument();
  const disciplines = useDisciplines();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [disciplineId, setDisciplineId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  function add(e: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(e.target.files ?? [])];
    e.target.value = ''; // permite escolher o mesmo ficheiro outra vez
    setError(null);
    setFiles((current) => [...current, ...chosen].slice(0, DOCUMENT_MAX_FILES));
    if (files.length + chosen.length > DOCUMENT_MAX_FILES) {
      setError(`No máximo ${DOCUMENT_MAX_FILES} ficheiros por documento.`);
    }
  }

  async function analyse() {
    setError(null);
    setPreparing(true);
    try {
      // Um PDF grande nem chega a ser lido (as fotografias encolhem ao converter, por isso só depois).
      const pdfBytes = files.filter((f) => f.type === 'application/pdf').reduce((sum, f) => sum + f.size, 0);
      if (pdfBytes > DOCUMENT_MAX_BYTES) {
        setError('O documento tem mais de 10 MB. Divide-o em partes mais pequenas.');
        return;
      }
      const upload = await Promise.all(files.map(toUploadFile));
      if (decodedBytes(upload) > DOCUMENT_MAX_BYTES) {
        setError('O documento tem mais de 10 MB. Divide-o em partes mais pequenas.');
        return;
      }
      const doc = await create.mutateAsync({
        files: upload,
        disciplineId: disciplineId ? Number(disciplineId) : null,
      });
      toast({ message: 'Documento enviado. A IA está a lê-lo; podes sair desta página.' });
      void navigate(`/documentos/${doc.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPreparing(false);
    }
  }

  const busy = preparing || create.isPending;
  return (
    <Card title="Ler um documento">
      <div className="space-y-4">
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={add}
        />
        <input
          ref={picker}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={add}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="secondary" disabled={busy} onClick={() => camera.current?.click()}>
            <Camera aria-hidden="true" className="size-4" />
            {files.length ? 'Mais uma página' : 'Fotografar'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => picker.current?.click()}>
            <Upload aria-hidden="true" className="size-4" />
            Escolher ficheiros
          </Button>
        </div>

        {files.length > 0 && (
          <ul
            aria-label="Ficheiros escolhidos"
            className="divide-y divide-stone-100 rounded-lg border border-stone-200"
          >
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {i + 1}. {file.name}
                </span>
                <span className="text-xs text-stone-500">{kb(file.size)}</span>
                <IconButton
                  label={`Retirar ${file.name}`}
                  disabled={busy}
                  onClick={() => setFiles((current) => current.filter((_, j) => j !== i))}
                >
                  <X aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <SelectField
          label="Disciplina (opcional)"
          value={disciplineId}
          disabled={busy}
          onChange={(e) => setDisciplineId(e.target.value)}
        >
          <option value="">Sem disciplina</option>
          {disciplines.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </SelectField>

        <p className="text-xs text-stone-600">
          Os ficheiros vão para a Google (Gemini) para serem lidos e ficam guardados no StudentOS, para a IA os voltar a
          ler (com imagens e tabelas) nas perguntas e nos quizzes; apagas o documento e eles saem. Espaço: 300 MB. Até{' '}
          {DOCUMENT_MAX_FILES} fotografias ou um PDF, no máximo 10 MB.
        </p>
        <FormError message={error} />
        <div aria-live="polite" className="flex flex-wrap items-center gap-3">
          <Button loading={busy} disabled={files.length === 0} onClick={() => void analyse()}>
            Ler com IA
          </Button>
          {busy && <span className="text-sm text-stone-600">A enviar…</span>}
        </div>
      </div>
    </Card>
  );
}
