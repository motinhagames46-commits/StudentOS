// Capturas para a página de entrada, com uma conta de teste e DADOS DE EXEMPLO (nunca dados reais).
// Só corre quando pedido: SCREENSHOTS=1 npx playwright test -c e2e/playwright.config.ts screenshots
import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers';

test.skip(!process.env.SCREENSHOTS, 'capturas só com SCREENSHOTS=1');

async function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(`/api${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
      return res.status === 204 ? null : res.json();
    },
    { method, path, body },
  ) as Promise<T>;
}

const inDays = (days: number, hour = 23) => {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

test('painel com dados de exemplo', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await register(page, 'Marta');

  const disciplines = [
    { name: 'Programação Web', code: 'PW', ects: 6, scores: [14, null], dates: [-20, 40] },
    { name: 'Bases de Dados', code: 'BD', ects: 6, scores: [11, null], dates: [-10, 9] },
    { name: 'Matemática Discreta', code: 'MD', ects: 5, scores: [7, null], dates: [-15, 5] },
    { name: 'Redes de Computadores', code: 'RC', ects: 5, scores: [null, null], dates: [12, 45] },
  ];
  for (const d of disciplines) {
    const { id } = await api<{ id: number }>(page, 'POST', '/disciplines', {
      name: d.name,
      code: d.code,
      ects: d.ects,
    });
    await api(page, 'POST', `/disciplines/${id}/assessments`, {
      name: 'Teste',
      type: 'TEST',
      weight: 40,
      date: inDays(d.dates[0]!, 10),
      ...(d.scores[0] === null ? {} : { score: d.scores[0] }),
    });
    await api(page, 'POST', `/disciplines/${id}/assessments`, {
      name: 'Exame',
      type: 'EXAM',
      weight: 60,
      minScore: 8,
      date: inDays(d.dates[1]!, 10),
    });
    if (d.code === 'PW') {
      await api(page, 'POST', '/tasks', {
        title: 'Entrega do projeto',
        disciplineId: id,
        dueDate: inDays(3),
        priority: 'HIGH',
        estimatedMinutes: 240,
      });
    }
    if (d.code === 'BD') {
      await api(page, 'POST', '/tasks', {
        title: 'Ficha 4 — SQL',
        disciplineId: id,
        dueDate: inDays(-1),
        estimatedMinutes: 60,
      });
      await api(page, 'POST', '/tasks', {
        title: 'Rever normalização',
        disciplineId: id,
        dueDate: inDays(5),
        estimatedMinutes: 90,
      });
    }
  }
  const everyDay = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
    { weekday, startMinute: 9 * 60, endMinute: 12 * 60 },
    { weekday, startMinute: 14 * 60, endMinute: 20 * 60 },
  ]);
  await api(page, 'PUT', '/preferences/study', {
    sessionMinutes: 50,
    minSessionMinutes: 25,
    breakMinutes: 10,
    maxDailyMinutes: 180,
    availability: everyDay,
  });
  const plan = await api<{ id: string }>(page, 'POST', '/planner/preview', { days: 7 });
  await api(page, 'POST', `/planner/${plan.id}/confirm`);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Olá, Marta' })).toBeVisible();
  await expect(page.getByText('Entrega do projeto').first()).toBeVisible();
  await page.screenshot({ path: 'apps/web/public/landing/painel.jpg', type: 'jpeg', quality: 80 });
  await page.screenshot({ path: testInfo.outputPath('painel-completo.png'), fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath('painel-telemovel.png'), fullPage: true });
});
