import { loginSchema, MIN_PASSWORD_LENGTH, registerSchema } from '@studentos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Button, FormError, TextField } from '../components/ui';
import { FullPageSpinner } from '../components/RequireAuth';
import { useMe } from '../hooks/useAuth';
import { api, ApiError, errorMessage } from '../lib/api';
import type { User } from '../lib/types';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-4 size-10" />
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-6">{children}</div>
        <p className="mt-6 text-center text-xs text-stone-500">
          <Link to="/privacidade" className="underline hover:text-stone-800">
            Privacidade
          </Link>
        </p>
      </div>
    </main>
  );
}

function useAuthSubmit(path: '/auth/login' | '/auth/register') {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(body: object) {
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await api<{ user: User }>(path, { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      const from = (location.state as { from?: string } | null)?.from;
      // Conta nova: primeiro o questionário de boas-vindas (pode ser saltado).
      if (path === '/auth/register') void navigate('/boas-vindas', { replace: true });
      else void navigate(from && from !== '/login' ? from : '/', { replace: true });
      // Sem setSubmitting(false) no sucesso: a navegação é uma transição e um render urgente da página
      // (já com sessão) ativaria o <Navigate to="/"> antes de chegarmos ao destino.
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return { submit, errors, setErrors, formError, submitting };
}

export function LoginPage() {
  const me = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, errors, setErrors, formError, submitting } = useAuthSubmit('/auth/login');

  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to="/" replace />;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    void submit(parsed.data);
  }

  return (
    <AuthShell title="Entrar no StudentOS" subtitle="Tarefas, avaliações e médias num só sítio.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          label="Palavra-passe"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <FormError message={formError} />
        <Button type="submit" loading={submitting} className="w-full">
          Entrar
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-600">
        Ainda não tens conta?{' '}
        <Link to="/registo" className="font-medium text-accent hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const me = useMe();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, errors, setErrors, formError, submitting } = useAuthSubmit('/auth/register');

  if (me.isPending) return <FullPageSpinner />;
  // Durante o registo a sessão já existe: quem navega é o submit (para as boas-vindas), não este atalho.
  if (me.data && !submitting) return <Navigate to="/" replace />;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    void submit(parsed.data);
  }

  return (
    <AuthShell title="Criar conta" subtitle="Organiza o teu semestre em poucos minutos.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          label="Nome"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          label="Palavra-passe"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres. Uma frase fácil de lembrar funciona bem.`}
        />
        <FormError message={formError} />
        <Button type="submit" loading={submitting} className="w-full">
          Criar conta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-600">
        Já tens conta?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
