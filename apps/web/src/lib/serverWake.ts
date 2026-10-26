// O servidor gratuito adormece ao fim de ~15 minutos sem pedidos e demora até um minuto a acordar.
// Pedidos lentos ativam um aviso honesto, e voltar a um separador escondido há muito tempo acorda-o cedo.
const SLOW_MS = 3000;
const WAKE_AFTER_HIDDEN_MS = 10 * 60 * 1000;

let slow = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Número de pedidos à espera há mais de 3 s (para useSyncExternalStore). */
export const slowRequests = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  count: () => slow,
};

/** Conta o pedido como lento se passar de 3 s sem resposta; deixa de contar quando termina. */
export function trackSlow<T>(request: Promise<T>): Promise<T> {
  let counted = false;
  const timer = setTimeout(() => {
    counted = true;
    slow++;
    emit();
  }, SLOW_MS);
  return request.finally(() => {
    clearTimeout(timer);
    if (counted) {
      slow--;
      emit();
    }
  });
}

/** Ao voltar a um separador escondido há 10+ minutos, acorda o servidor antes do primeiro clique. */
export function wakeServerOnReturn(): () => void {
  let hiddenAt: number | null = null;
  const onChange = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= WAKE_AFTER_HIDDEN_MS) {
      void trackSlow(fetch('/api/health').catch(() => undefined));
    }
    hiddenAt = null;
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
