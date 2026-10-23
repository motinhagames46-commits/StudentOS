// Transferir disciplinas para outra conta do mesmo estudante: código de uso único, pré-visualização e confirmação.
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('transferir disciplinas de uma conta para outra', async ({ page }) => {
  await register(page, 'Origem');
  const created = await page.evaluate(async () => {
    const post = (url: string, body: unknown) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = (await (
      await post('/api/disciplines', { name: 'Redes de Computadores', code: 'RDC', ects: 6 })
    ).json()) as {
      id: number;
    };
    return (await post(`/api/disciplines/${d.id}/assessments`, { name: 'Teste', type: 'TEST', weight: 100 })).status;
  });
  expect(created).toBe(201);

  await page.goto('/conta');
  await expect(page.getByRole('checkbox', { name: 'RDC — Redes de Computadores' })).toBeChecked();
  await page.getByRole('button', { name: 'Gerar código' }).click();
  const code = (await page.getByLabel('Código gerado').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  await page.getByRole('button', { name: 'Terminar sessão' }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await register(page, 'Destino');

  await page.goto('/conta');
  await page.getByRole('textbox', { name: 'Código de transferência' }).fill(code);
  await page.getByRole('button', { name: 'Ver o que vem' }).click();
  await expect(page.getByText('RDC — Redes de Computadores')).toBeVisible();
  await expect(page.getByText('Origem', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Transferir para esta conta' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Transferência concluída' })).toBeVisible();

  await page.goto('/disciplinas');
  await expect(page.getByText('Redes de Computadores')).toBeVisible();
});
