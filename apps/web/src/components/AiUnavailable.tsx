import { Link } from 'react-router';
import type { AiStatus } from '../lib/types';
import { Card } from './ui';

/** Funcionalidade de IA ainda indisponível: diz porquê e, se a conta a pode ativar, onde. */
export function AiUnavailable({ status, action }: { status: AiStatus | undefined; action: string }) {
  return (
    <Card>
      <p className="text-sm text-stone-700">
        {status === 'NOT_ALLOWED'
          ? 'A IA não está disponível nesta conta.'
          : `Para ${action}, ativa primeiro o assistente de IA.`}
      </p>
      {status !== 'NOT_ALLOWED' && (
        <Link to="/integracoes" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
          Ir para Integrações
        </Link>
      )}
    </Card>
  );
}
