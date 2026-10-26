import { ArrowLeft, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useConfirm } from '../components/ConfirmDialog';
import { DocumentReview } from '../components/DocumentReview';
import { useToast } from '../components/Toast';
import { Button, Card, ErrorState, LoadingList, PageHeader } from '../components/ui';
import { useDeleteDocument, useDocument } from '../hooks/queries';
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

  if (!Number.isInteger(id) || id <= 0) return <ErrorState message="Documento não encontrado" />;
  if (doc.error) return <ErrorState message={errorMessage(doc.error)} onRetry={() => void doc.refetch()} />;
  if (doc.isPending) return <LoadingList rows={3} />;
  const d = doc.data;

  async function handleDelete() {
    const ok = await confirm({
      title: `Eliminar «${d.title}»?`,
      message: 'O texto transcrito é apagado. As avaliações e tarefas que já gravaste a partir dele ficam.',
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
      <div className="space-y-4">
        {d.proposals.length > 0 && <DocumentReview doc={d} />}
        <Card title="Texto transcrito" collapsible>
          <p className="text-sm whitespace-pre-wrap text-stone-800">{d.text}</p>
        </Card>
      </div>
    </>
  );
}
