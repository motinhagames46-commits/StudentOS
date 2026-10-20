// Exportar o plano para o calendário pessoal: o botão descarrega um .ics com a sessão iniciada (sem link público).
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('«Exportar para o meu calendário» descarrega um .ics com os prazos e lembretes', async ({ page }) => {
  await register(page, 'Lia');
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  await page.evaluate(async (dueDate) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Entregar relatório, versão final', dueDate }),
    });
    if (!res.ok) throw new Error(`POST /tasks → ${res.status}`);
  }, dueDate);

  await page.goto('/calendario');
  await expect(page.getByText(/não fica guardado no StudentOS/)).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar para o meu calendário' }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toMatch(/^studentos-calendario-\d{4}-\d{2}-\d{2}\.ics$/);
  const text = await readFile(await download.path(), 'utf8');
  expect(text).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  expect(text).toContain('SUMMARY:Prazo · Entregar relatório\\, versão final\r\n');
  expect(text).toContain('BEGIN:VALARM');
  expect(text).toMatch(/END:VCALENDAR\r\n$/);
});
