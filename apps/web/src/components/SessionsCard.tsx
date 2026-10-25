import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Card, ErrorState, FormError, LoadingList } from './ui';

interface ActiveSession {
  id: number;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** Descrição curta do dispositivo a partir do user-agent (apenas informativa). */
function describeDevice(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

/** Sessões ativas da conta, com revogação individual (spec §14.1). */
export function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<ActiveSession[]>('/me/sessions') });
  const revoke = useMutation({
    mutationFn: (id: number) => api<void>(`/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  return (
    <Card title="Sessões ativas">
      {sessions.error ? (
        <ErrorState message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} />
      ) : sessions.isPending ? (
        <LoadingList rows={2} />
      ) : (
        <ul className="divide-y divide-stone-100">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <Laptop aria-hidden="true" className="size-4 shrink-0 text-stone-400" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-stone-900">
                  {describeDevice(s.userAgent)}
                  {s.current && <Badge tone="accent">Esta sessão</Badge>}
                </p>
                <p className="text-xs text-stone-500">
                  Iniciada a {formatDateTime(s.createdAt)} · última atividade {formatDateTime(s.lastSeenAt)}
                </p>
              </div>
              {!s.current && (
                <Button
                  variant="secondary"
                  onClick={() => revoke.mutate(s.id)}
                  loading={revoke.isPending && revoke.variables === s.id}
                >
                  Terminar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormError message={revoke.error ? errorMessage(revoke.error) : null} />
    </Card>
  );
}
