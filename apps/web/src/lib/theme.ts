// Modo noite: o tema está em <html data-theme>, aplicado antes da primeira pintura por public/theme.js.
// Sem escolha guardada segue o sistema, também quando este muda; a escolha fica só neste browser.
const KEY = 'tema';
const system = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function apply(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // Cor da barra do browser no telemóvel: a superfície de cada tema (--color-white em index.css).
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1c1a19' : '#ffffff');
  listeners.forEach((listener) => listener());
}

/** Estado do tema (para useSyncExternalStore) e o botão que o troca. */
export const theme = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isDark: () => document.documentElement.dataset.theme === 'dark',
  toggle() {
    const dark = !theme.isDark();
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    } catch {
      // Sem armazenamento: o tema muda só nesta visita.
    }
    apply(dark);
  },
};

system?.addEventListener('change', (e) => {
  if (!stored()) apply(e.matches);
});
apply(stored() ? stored() === 'dark' : (system?.matches ?? false));
