// Página de entrada: visível sem sessão, simulador a correr só no browser, acessível e sem scroll horizontal.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('visitante vê a página de entrada e o simulador não envia nada para o servidor', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push(url.pathname);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Organiza o semestre/ })).toBeVisible();

  // 8 no teste (40 %): a final arredonda, por isso passar é ter 9,5 → (9,5 − 3,2) / 0,6 = 10,5 no exame
  const result = page.locator('p[aria-live="polite"]');
  await expect(result).toContainText('precisas de 10,5');
  // Com 20 no teste bastaria 2,5, mas o exame tem mínimo 8: manda a nota mínima
  await page.getByLabel('Tive no teste').fill('20');
  await expect(result).toContainText('8');
  await expect(result).toContainText('(nota mínima)');
  await page.getByRole('button', { name: '16' }).click();
  await expect(result).toContainText('Para teres 16 precisas de 12,5');

  expect([...new Set(apiCalls)]).toEqual(['/api/me']);

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  await page.getByRole('link', { name: 'Criar conta grátis' }).first().click();
  await expect(page).toHaveURL(/\/registo$/);
  await page.getByRole('link', { name: 'StudentOS — página inicial' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Organiza o semestre/ })).toBeVisible();
});

test('no telemóvel (375 px) não há scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Organiza o semestre/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('outras rotas sem sessão continuam a pedir o login', async ({ page }) => {
  await page.goto('/tarefas');
  await expect(page).toHaveURL(/\/login$/);
});

test('ficheiros com hash ficam em cache longa e o HTML revalida a cada visita', async ({ page }) => {
  const assetHeaders: string[] = [];
  page.on('response', (r) => {
    if (new URL(r.url()).pathname.startsWith('/assets/')) assetHeaders.push(r.headers()['cache-control'] ?? '');
  });
  const html = await page.goto('/');
  expect(html?.headers()['cache-control']).toBe('no-cache');
  await expect(page.getByRole('heading', { level: 1, name: /Organiza o semestre/ })).toBeVisible();
  expect(assetHeaders.length).toBeGreaterThan(0);
  for (const h of assetHeaders) expect(h).toContain('immutable');

  // Um ficheiro de uma versão antiga dá 404 (não o HTML), para a app recarregar a versão nova
  const missing = await page.request.get('/assets/nao-existe-abc123.js');
  expect(missing.status()).toBe(404);
});
