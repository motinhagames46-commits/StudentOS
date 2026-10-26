// Servidor gratuito a acordar: um pedido lento mostra um aviso honesto, que desaparece quando a resposta chega.
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('pedido lento mostra «A ligar ao servidor…» até a resposta chegar', async ({ page }) => {
  await register(page, 'Nuno');
  await page.route('**/api/tasks?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await route.continue();
  });
  await page.goto('/tarefas');
  const notice = page.getByRole('status').filter({ hasText: 'A ligar ao servidor' });
  await expect(notice).toBeVisible({ timeout: 4000 });
  await expect(notice).toBeHidden({ timeout: 10_000 });
});
