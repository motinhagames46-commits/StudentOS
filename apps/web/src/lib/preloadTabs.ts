// Depois do primeiro ecrã, o código das páginas dos separadores descarrega em segundo plano: trocar de separador
// deixa de mostrar o skeleton à espera do código (conselho de 2026-11-02). Os dados continuam a pedir-se ao abrir.
const pages = [
  () => import('../pages/DashboardPage'),
  () => import('../pages/CalendarPage'),
  () => import('../pages/DisciplinesPage'),
  () => import('../pages/StudyHubPage'),
  () => import('../pages/StudySessionsPage'),
];

/** Agenda o pré-carregamento para quando o browser estiver livre; devolve a função que o cancela. */
export function preloadTabs(): () => void {
  // Uma falha aqui (sem rede, versão nova) não importa: ao abrir a página, lazyPage trata dela.
  const run = () => pages.forEach((load) => void load().catch(() => undefined));
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}
