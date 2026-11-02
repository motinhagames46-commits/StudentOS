import { ArrowLeft, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useConfirm } from '../components/ConfirmDialog';
import { DocumentReview } from '../components/DocumentReview';
import { useToast } from '../components/Toast';
import { Button, Card, ErrorState, FormError, LoadingList, PageHeader } from '../components/ui';
import { useDeleteDocument, useDocument, useRetryDocument } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';

/** Um documento lido: datas por rever (nada é gravado sem confirmação) e o texto transcrito. */
export function DocumentDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const doc = useDocument(id);
  const remove = useDeleteDocument();
  const retry = useRetryDocument();

  if (!Number.isInteger(id) || id <= 0) return <ErrorState message="Documento não encontrado" />;
  if (doc.error) return <ErrorState message={errorMessage(doc.error)} onRetry={() => void doc.refetch()} />;
  if (doc.isPending) return <LoadingList rows={3} />;
  const d = doc.data;

  async function handleDelete() {
    const ok = await confirm({
      title: `Eliminar «${d.title}»?`,
      message:
        'O ficheiro e o texto transcrito são apagados. As avaliações e tarefas que já gravaste a partir dele ficam.',
      confirmLabel: 'Eliminar documento',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(d.id);
    } catch (err) {
      toast({ message: errorMessage(err) });
      return;
    }
    toast({ message: 'Documento eliminado.' });
    void navigate('/documentos');
  }

  return (
    <>
      <Link
        to="/documentos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Documentos
      </Link>
      <PageHeader
        title={d.title}
        subtitle={`${formatDate(d.createdAt)} · ${d.pageCount === 1 ? '1 página' : `${d.pageCount} páginas`}`}
        action={
          <Button variant="danger" loading={remove.isPending} onClick={() => void handleDelete()}>
            <Trash2 aria-hidden="true" className="size-4" />
            Eliminar
          </Button>
        }
      />
      {d.status === 'PROCESSING' ? (
        <Card>
          <p role="status" className="flex items-start gap-2 text-sm text-stone-700">
            <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin text-accent" />A IA está a ler o
            documento, o que pode levar alguns minutos. Esta página atualiza-se sozinha e podes sair dela: a leitura
            continua.
          </p>
        </Card>
      ) : d.status === 'FAILED' ? (
        <Card>
          <p role="alert" className="text-sm text-red-800">
            A leitura falhou: {d.failureReason ?? 'motivo desconhecido.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button loading={retry.isPending} onClick={() => retry.mutate(d.id)}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Tentar de novo
            </Button>
            <p className="text-sm text-stone-600">Usa o ficheiro que já enviaste.</p>
          </div>
          <FormError message={retry.error ? errorMessage(retry.error) : null} />
        </Card>
      ) : (
        <div className="space-y-4">
          {d.proposals.length > 0 && <DocumentReview doc={d} />}
          <Card title="Texto transcrito" collapsible>
            <p className="text-sm whitespace-pre-wrap text-stone-800">{d.text}</p>
          </Card>
        </div>
      )}
    </>
  );
}
