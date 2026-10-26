// Eliminar uma tarefa com «Desfazer» (sem o confirm do browser): some logo e só é apagada quando o aviso fecha.
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('eliminar tarefa: «Desfazer» devolve-a; fechar o aviso apaga-a mesmo', async ({ page }) => {
  await register(page, 'Ines');
  await page.evaluate(() =>
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ler capítulo 4' }),
    }),
  );
  await page.goto('/tarefas');
  const task = page.getByText('Ler capítulo 4', { exact: true });
  await expect(task).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar "Ler capítulo 4"' }).click();
  await expect(task).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Tarefa «Ler capítulo 4» eliminada.' })).toBeVisible();
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(task).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar "Ler capítulo 4"' }).click();
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(task).toBeHidden();
  await page.waitForResponse((r) => r.url().includes('/api/tasks/') && r.request().method() === 'DELETE');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Tarefas' })).toBeVisible();
  await expect(task).toBeHidden();
});
