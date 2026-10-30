// Tema antes da primeira pintura, para o modo noite não piscar a branco. Ficheiro próprio porque a CSP do
// servidor não deixa correr scripts inline. A lógica completa (botão, sistema) está em src/lib/theme.ts.
/* global window, document */
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('tema');
  } catch {
    // Sem armazenamento (modo privado): segue o sistema.
  }
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
