import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, FormError, PageHeader, TextField } from '../components/ui';
import { useMe } from '../hooks/useAuth';
import { api, errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';

/** Conta: sessões, exportação e eliminação de dados (RF11 / RF12, RGPD). */
export function AccountPage() {
  const { data } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'logout-all' | 'delete' | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!data) return null;
  const { user } = data;

  async function exportData() {
    setBusy('export');
    setMessage(null);
    try {
      const res = await fetch('/api/me/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Não foi possível exportar os dados');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studentos-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function logoutAll() {
    setBusy('logout-all');
    try {
      await api('/auth/logout-all', { method: 'POST' });
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
      navigate('/login');
    } catch (err) {
      setMessage(errorMessage(err));
      setBusy(null);
    }
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    setBusy('delete');
    try {
      await api('/me', { method: 'DELETE', body: { confirmEmail } });
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
      navigate('/login');
    } catch (err) {
      setDeleteError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Conta" />
      <div className="space-y-4">
        <Card title="Perfil">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-stone-500">Nome</dt>
              <dd className="font-medium text-stone-900">{user.name}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Email</dt>
              <dd className="font-medium break-all text-stone-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Conta criada em</dt>
              <dd className="font-medium text-stone-900">{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Sessões e dados">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-stone-600">Descarrega todos os teus dados em formato JSON.</p>
              <Button variant="secondary" onClick={exportData} loading={busy === 'export'}>
                Exportar dados
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-stone-600">Termina a sessão em todos os dispositivos.</p>
              <Button variant="secondary" onClick={logoutAll} loading={busy === 'logout-all'}>
                Terminar todas as sessões
              </Button>
            </div>
            <FormError message={message} />
          </div>
        </Card>

        <Card title="Eliminar conta" className="border-red-200">
          <form onSubmit={deleteAccount} className="space-y-3">
            <p className="text-sm text-stone-600">
              Esta ação apaga permanentemente a conta, as disciplinas, as avaliações e as tarefas. Não pode ser
              desfeita.
            </p>
            <TextField
              label={`Escreve ${user.email} para confirmar`}
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="max-w-sm"
            />
            <FormError message={deleteError} />
            <Button
              type="submit"
              variant="danger"
              disabled={confirmEmail.trim().toLowerCase() !== user.email}
              loading={busy === 'delete'}
            >
              Eliminar conta permanentemente
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-stone-500">
          <Link to="/privacidade" className="underline hover:text-stone-800">
            Política de privacidade
          </Link>
        </p>
      </div>
    </>
  );
}
