// Testes end-to-end (secção 14) contra o build de produção local.
// O `npm run test:e2e` faz o build; aqui só se arranca o servidor (`npm start`) com a base de dados de teste.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4100);
const BASE_URL = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://studentos:studentos@localhost:54329/studentos_test';

// No CI a base de dados é um serviço do GitHub Actions; localmente usa-se o `npm run db` (porta 54329).
const usesLocalDb = !process.env.E2E_DATABASE_URL;

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    ...(usesLocalDb
      ? [
          {
            // Reaproveita o PostgreSQL local se já estiver a correr.
            command: 'npm run db',
            cwd: '..',
            port: 54329,
            reuseExistingServer: true,
            timeout: 60_000,
          },
        ]
      : []),
    {
      command: 'npm start',
      cwd: '..',
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'production',
        PORT: String(PORT),
        DATABASE_URL,
        // Todos os testes vêm do mesmo IP: o limite geral de produção (300/15 min) bloquearia a suite.
        // O limite de tentativas de palavra-passe mantém-se igual ao de produção.
        RATE_LIMIT_PER_15_MIN: '10000',
      },
    },
  ],
});
