import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// Avisos discretos da própria app (em vez de alert/confirm do browser). Acessibilidade: anunciados por uma
// região aria-live, nunca roubam o foco, e o tempo pára enquanto o rato ou o foco estão no aviso (WCAG 2.2.1).

type CloseReason = 'timeout' | 'dismiss' | 'action';

export interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: 'neutral' | 'error';
  /** Por defeito 6 s, ou 10 s quando há ação (por exemplo, «Desfazer»). */
  duration?: number;
  onClose?: (reason: CloseReason) => void;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast fora do ToastProvider');
  return show;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((options: ToastOptions) => {
    setToasts((list) => [...list, { ...options, id: nextId++ }]);
  }, []);

  const close = useCallback((toast: ToastItem, reason: CloseReason) => {
    setToasts((list) => list.filter((t) => t.id !== toast.id));
    toast.onClose?.(reason);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-32 z-50 flex flex-col items-center gap-2 px-4 md:bottom-16"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={(reason) => close(t, reason)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onClose }: { toast: ToastItem; onClose: (reason: CloseReason) => void }) {
  const duration = toast.duration ?? (toast.action ? 10_000 : 6_000);
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const [paused, setPaused] = useState(false);
  const expire = useEffectEvent(() => onClose('timeout'));

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(expire, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
      className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg py-2 pr-2 pl-4 text-sm text-white shadow-lg ${
        toast.tone === 'error' ? 'bg-red-700' : 'bg-stone-900'
      }`}
    >
      <p>{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onClose('action');
          }}
          className="rounded-md px-2 py-1 font-semibold text-white underline underline-offset-2 hover:bg-white/10 focus-visible:outline-white"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => onClose('dismiss')}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-white"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
