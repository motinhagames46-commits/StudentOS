// Os testes da API aplicam migrações e esvaziam tabelas (TRUNCATE): só podem correr contra uma base de
// dados local e descartável. Recusa qualquer outro destino, por exemplo um TEST_DATABASE_URL de produção.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function assertDisposableTestDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL inválido.');
  }
  const database = parsed.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTS.has(parsed.hostname) || !database.endsWith('_test')) {
    // Sem mostrar o URL: pode conter a palavra-passe.
    throw new Error(
      `Recusado: os testes só correm numa base local terminada em "_test" (recebido: anfitrião ${parsed.hostname}, base ${database || '—'}).`,
    );
  }
}
