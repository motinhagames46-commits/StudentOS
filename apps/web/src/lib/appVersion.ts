// Depois de um deploy, um separador aberto continua com o código antigo (e pode mostrar coisas erradas).
// O servidor diz em cada resposta que versão está a correr; se não for a desta página, aparece o aviso.
const BUILT: string = import.meta.env.VITE_APP_VERSION ?? '';

let outdated = false;
const listeners = new Set<() => void>();

/** Estado do aviso (para useSyncExternalStore). */
export const appVersion = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  outdated: () => outdated,
};

/** Compara a versão anunciada pelo servidor com a desta página; `built` só muda nos testes. */
export function noteServerVersion(res: Response, built = BUILT): void {
  const server = res.headers.get('x-app-version');
  if (outdated || !built || !server || server === built) return;
  outdated = true;
  listeners.forEach((listener) => listener());
}
