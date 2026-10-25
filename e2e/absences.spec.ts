// Faltas por UC: contador com limite e aviso antes de o ultrapassar.
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('registar faltas avisa quando se chega ao limite', async ({ page }) => {
  await register(page, 'Beatriz');
  await page.goto('/disciplinas');
  await page.getByRole('button', { name: 'Nova disciplina' }).click();
  await page.getByLabel('Nome').fill('Redes de Computadores');
  await page.getByLabel('Sigla').fill('RC');
  await page.getByRole('button', { name: 'Criar disciplina' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Redes de Computadores' })).toBeVisible();

  const faltas = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Faltas' }) });
  await faltas.getByLabel('Limite de faltas').fill('2');
  await faltas.getByRole('button', { name: 'Guardar' }).click();
  await expect(faltas.getByRole('status')).toHaveText('Podes faltar mais 2 vezes.');

  await faltas.getByRole('button', { name: 'Registar uma falta' }).click();
  await expect(faltas.getByRole('status')).toHaveText('Só podes faltar mais uma vez.');
  await faltas.getByRole('button', { name: 'Registar uma falta' }).click();
  await expect(faltas.getByRole('status')).toContainText('Chegaste ao limite');
  await faltas.getByRole('button', { name: 'Retirar uma falta' }).click();
  await expect(faltas.getByText('1 falta de 2')).toBeVisible();

  // Fica gravado
  await page.reload();
  await expect(faltas.getByText('1 falta de 2')).toBeVisible();
});
