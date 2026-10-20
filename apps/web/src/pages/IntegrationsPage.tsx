import { useQuery } from '@tanstack/react-query';
import { FileUp, Info } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Card, ErrorState, LoadingList, PageHeader } from '../components/ui';
import { api, errorMessage } from '../lib/api';

interface IntegrationView {
  provider: 'OUTLOOK' | 'MOODLE';
  status: 'NOT_CONFIGURED' | 'PENDING_AUTHORIZATION' | 'CONNECTED' | 'SYNCING' | 'ERROR' | 'REAUTH_REQUIRED';
  available: boolean;
  reads: string;
  requirement: string;
  alternative: string;
}

const names = { OUTLOOK: 'Outlook (Microsoft 365)', MOODLE: 'Moodle do IPVC' } as const;
const statusLabels: Record<IntegrationView['status'], string> = {
  NOT_CONFIGURED: 'Não ligado — indisponível nesta versão',
  PENDING_AUTHORIZATION: 'A aguardar autorização',
  CONNECTED: 'Ligado',
  SYNCING: 'A sincronizar',
  ERROR: 'Erro',
  REAUTH_REQUIRED: 'Autorização necessária',
};

/** Integrações (spec §9, §10): estado real, sem botões "Ligar" que não funcionam. */
export function IntegrationsPage() {
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: () => api<IntegrationView[]>('/integrations') });

  return (
    <>
      <PageHeader
        title="Integrações"
        subtitle="Ligações diretas a serviços externos. Só aparecem como ligadas depois de uma verificação real."
      />
      {integrations.error ? (
        <ErrorState message={errorMessage(integrations.error)} onRetry={() => integrations.refetch()} />
      ) : integrations.isPending ? (
        <LoadingList rows={2} />
      ) : (
        <div className="space-y-4">
          {integrations.data.map((i) => (
            <Card key={i.provider} title={names[i.provider]} action={<Badge>{statusLabels[i.status]}</Badge>}>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-medium text-stone-800">O que seria lido</dt>
                  <dd className="text-stone-600">{i.reads}</dd>
                </div>
                <div>
                  <dt className="font-medium text-stone-800">Porque ainda não está disponível</dt>
                  <dd className="text-stone-600">{i.requirement}</dd>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <dt className="font-medium text-stone-800">O que podes fazer já</dt>
                  <dd className="mt-1 text-stone-600">{i.alternative}</dd>
                  <dd className="mt-2">
                    <Link
                      to="/importar"
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                    >
                      <FileUp aria-hidden="true" className="size-4" />
                      Importar ficheiro .ics
                    </Link>
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
          <Card title="Assistente de IA" action={<Badge>Desligado</Badge>}>
            <p className="flex gap-2 text-sm text-stone-600">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Não incluído nesta versão. O plano de estudo é calculado por regras fixas, sem IA, e nenhum dado é enviado
              a fornecedores de IA.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
