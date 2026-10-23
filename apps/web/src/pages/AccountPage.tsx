import { MIN_PASSWORD_LENGTH } from '@studentos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { SessionsCard } from '../components/SessionsCard';
import { TransferCard } from '../components/TransferCard';
import { Button, Card, FormError, PageHeader, TextField } from '../components/ui';
import { useMe } from '../hooks/useAuth';
import { ApiError, api, downloadFile, errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';

/** Conta: palavra-passe, sessões, exportação e eliminação de dados (RF11 / RF12, RGPD). */
export function AccountPage() {
  const { data } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'logout-all' | 'delete' | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!data) return null;
  const { user } = data;

  async function exportData() {
    setBusy('export');
    setMessage(null);
    try {
      await downloadFile('/me/export', `studentos-export-${new Date().toISOString().slice(0, 10)}.json`);
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
      await api('/me', { method: 'DELETE', body: { confirmEmail, password: deletePassword } });
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
      navigate('/login');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? (err.fieldErrors().password ?? err.message) : errorMessage(err));
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

        <PasswordCard />

        <SessionsCard />

        <TransferCard />

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
            <TextField
              label="Palavra-passe"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="max-w-sm"
            />
            <FormError message={deleteError} />
            <Button
              type="submit"
              variant="danger"
              disabled={confirmEmail.trim().toLowerCase() !== user.email || !deletePassword}
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

/** Mudar a palavra-passe: termina as sessões nos outros dispositivos (esta continua com uma sessão nova). */
function PasswordCard() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    setFormError(null);
    if (next !== repeat) {
      setErrors({ repeat: 'As palavras-passe não coincidem' });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api('/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Palavra-passe">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="Palavra-passe atual"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={errors.currentPassword}
          />
          <TextField
            label="Nova palavra-passe"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={errors.newPassword}
            hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`}
          />
          <TextField
            label="Repetir a nova"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            error={errors.repeat}
          />
        </div>
        <FormError message={formError} />
        {done && (
          <p role="status" className="text-sm text-green-800">
            Palavra-passe alterada. As sessões nos outros dispositivos foram terminadas.
          </p>
        )}
        <Button type="submit" variant="secondary" loading={saving} disabled={!current || !next || !repeat}>
          Mudar palavra-passe
        </Button>
      </form>
    </Card>
  );
}
