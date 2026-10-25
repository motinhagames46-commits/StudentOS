// Componentes de interface reutilizáveis (secção 13).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover disabled:bg-accent/60',
  secondary: 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
};

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-flex size-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800',
        className,
      )}
    >
      {children}
    </button>
  );
}

const inputClass =
  'block w-full min-h-10 rounded-lg border bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(inputClass, error ? 'border-red-400' : 'border-stone-300')}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-stone-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  error,
  className,
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(inputClass, error ? 'border-red-400' : 'border-stone-300')}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Painel ao estilo x_panel do Gentelella. `collapsible` guarda o estado neste browser (só preferência visual). */
export function Card({
  title,
  action,
  children,
  className,
  collapsible = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
}) {
  const bodyId = useId();
  const storageKey = collapsible && title ? `painel-recolhido:${title}` : null;
  const [collapsed, setCollapsed] = useState(() => readFlag(storageKey));
  const toggle = () => {
    setCollapsed(!collapsed);
    writeFlag(storageKey, !collapsed);
  };

  return (
    <section
      className={cx('rounded-lg border border-panel-border bg-white shadow-[0_1px_4px_rgba(42,63,84,0.06)]', className)}
    >
      {title && (
        <header
          className={cx(
            'flex items-center justify-between gap-2 px-4 py-3',
            !collapsed && 'border-b-2 border-panel-border',
          )}
        >
          <h2 className="text-base font-semibold text-stone-800">{title}</h2>
          <div className="flex items-center gap-1">
            {action}
            {storageKey && (
              <IconButton
                label={collapsed ? `Expandir «${title}»` : `Recolher «${title}»`}
                aria-expanded={!collapsed}
                aria-controls={bodyId}
                onClick={toggle}
                className="size-8"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={cx('size-4 motion-safe:transition-transform', collapsed && '-rotate-90')}
                />
              </IconButton>
            )}
          </div>
        </header>
      )}
      <div id={bodyId} hidden={collapsed} className="p-4">
        {children}
      </div>
    </section>
  );
}

function readFlag(key: string | null): boolean {
  if (!key) return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string | null, value: boolean) {
  if (!key) return;
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Sem armazenamento (modo privado): o painel recolhe só nesta visita.
  }
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center">
      <p className="text-sm text-stone-500">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center"
    >
      <p className="flex items-center gap-2 text-sm text-red-800">
        <AlertCircle aria-hidden="true" className="size-4" />
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-lg bg-stone-200/70', className)} />;
}

export function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="A carregar">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'red' | 'amber' | 'accent';
}) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-700',
    green: 'bg-green-50 text-green-800',
    red: 'bg-red-50 text-red-800',
    amber: 'bg-amber-50 text-amber-900',
    accent: 'bg-accent-soft text-accent-ink',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function DisciplineChip({ discipline }: { discipline: { code: string; color: string | null; name: string } }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700"
      title={discipline.name}
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ backgroundColor: discipline.color ?? '#a8a29e' }}
      />
      {discipline.code}
    </span>
  );
}
