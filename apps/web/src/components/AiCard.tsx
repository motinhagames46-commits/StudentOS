import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, ShieldCheck, Sparkles } from 'lucide-react';
import { useAiStatus } from '../hooks/queries';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { AiStatus } from '../lib/types';
import { useToast } from './Toast';
import { Badge, Button, Card, ErrorState, FormError, Skeleton } from './ui';

const badges: Record<AiStatus, { label: string; tone: 'neutral' | 'amber' | 'green' }> = {
  NOT_ALLOWED: { label: 'Indisponível', tone: 'neutral' },
  NOT_CONFIGURED: { label: 'Não configurada', tone: 'amber' },
  NEEDS_CONSENT: { label: 'Desligada', tone: 'neutral' },
  ENABLED: { label: 'Ativa', tone: 'green' },
};

/** Assistente de IA (Gemini): só para contas autorizadas no servidor, e só depois do consentimento. */
export function AiCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const status = useAiStatus();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ai-status'] });
  const consent = useMutation({ mutationFn: () => api('/ai/consent', { method: 'POST' }), onSuccess: refresh });
  const withdraw = useMutation({ mutationFn: () => api('/ai/consent', { method: 'DELETE' }), onSuccess: refresh });
  const check = useMutation({
    mutationFn: () => api<{ ok: boolean; model: string }>('/ai/check', { method: 'POST', expectSlow: true }),
    onSuccess: (r) => toast({ message: `Ligação verificada: o Gemini respondeu (${r.model}).` }),
  });

  if (status.error) return <ErrorState message={errorMessage(status.error)} onRetry={() => void status.refetch()} />;
  if (status.isPending) return <Skeleton className="h-32" />;

  const s = status.data.status;
  const badge = badges[s];
  const busy = consent.isPending || withdraw.isPending;
  const mutationError = consent.error ?? withdraw.error ?? check.error;

  return (
    <Card title="Assistente de IA (Gemini)" action={<Badge tone={badge.tone}>{badge.label}</Badge>}>
      {s === 'NOT_ALLOWED' ? (
        <p className="flex gap-2 text-sm text-stone-600">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Não disponível nesta conta. O plano de estudo é calculado por regras fixas, sem IA, e nenhum dado teu é
          enviado a fornecedores de IA.
        </p>
      ) : (
        <div className="space-y-4 text-sm text-stone-700">
          {s === 'NOT_CONFIGURED' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              Falta a chave do Gemini no servidor (<code>GEMINI_API_KEY</code>). Sem ela nada é enviado à Google.
            </p>
          )}
          <div className="space-y-2">
            <p className="flex gap-2 font-medium text-stone-800">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />O que acontece se
              ativares
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Só o que escolheres analisar vai para a Google (API Gemini): fotografias e PDFs de apontamentos,
                perguntas ao assistente com os documentos que lhes respondem, os documentos para criar quizzes, as tuas
                respostas escritas para as corrigir e totais agregados das finanças.
              </li>
              <li>
                Os ficheiros dos documentos (fotografias e PDF) ficam guardados no StudentOS para a IA os voltar a ler,
                com imagens e tabelas, nas perguntas e nos quizzes. Apagar o documento apaga-os. Para não os enviar em
                cada pergunta, a Google guarda uma cópia de cada ficheiro durante 48 horas.
              </li>
              <li>
                Quando os teus documentos não chegam para responder, o assistente pesquisa a pergunta na Pesquisa
                Google; nesse caso a Google guarda a pergunta e a resposta durante 30 dias.
              </li>
              <li>
                No Espaço Económico Europeu, os termos da API Gemini não deixam a Google usar este conteúdo para
                melhorar os seus produtos, mesmo no plano gratuito.
              </li>
              <li>A IA pode enganar-se: o que propõe é sempre revisto por ti antes de ficar gravado.</li>
              <li>Podes desligar a qualquer momento; os dados já guardados no StudentOS ficam até os apagares.</li>
            </ul>
          </div>
          {/* Consentimento dado a um texto anterior: o servidor devolve NEEDS_CONSENT e pede-se outra vez. */}
          {status.data.consentAt && s === 'NEEDS_CONSENT' ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              O texto acima mudou desde que ativaste a IA. Lê-o e ativa outra vez para continuares.
            </p>
          ) : (
            status.data.consentAt && (
              <p className="text-xs text-stone-600">Ativada em {formatDateTime(status.data.consentAt)}.</p>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {status.data.consentAt && s !== 'NEEDS_CONSENT' ? (
              <>
                {s === 'ENABLED' && (
                  <Button loading={check.isPending} onClick={() => check.mutate()}>
                    <Sparkles aria-hidden="true" className="size-4" />
                    Verificar ligação
                  </Button>
                )}
                <Button
                  variant="secondary"
                  loading={withdraw.isPending}
                  disabled={busy}
                  onClick={() => withdraw.mutate()}
                >
                  Desligar a IA
                </Button>
              </>
            ) : (
              <Button loading={consent.isPending} disabled={busy} onClick={() => consent.mutate()}>
                Ativar a IA (aceito)
              </Button>
            )}
          </div>
          <FormError message={mutationError ? errorMessage(mutationError) : null} />
        </div>
      )}
    </Card>
  );
}
