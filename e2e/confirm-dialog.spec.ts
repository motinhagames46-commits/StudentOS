// Confirmações dentro da app (sem o confirm do browser): diz o que vai ser apagado, Esc cancela, acessível.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('eliminar uma disciplina pede confirmação com o que vai ser apagado', async ({ page }) => {
  await register(page, 'Rita');
  const id = await page.evaluate(async () => {
    const send = (path: string, body: unknown, method = 'POST') =>
      fetch(`/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<{ id: number }>);
    const d = await send('/disciplines', { name: 'Redes de Computadores', code: 'RC', ects: 5 });
    await send(`/disciplines/${d.id}/assessments`, { name: 'Teste', type: 'TEST', weight: 40, score: 12 });
    await send(`/disciplines/${d.id}/assessments`, { name: 'Exame', type: 'EXAM', weight: 60 });
    await send(`/disciplines/${d.id}`, { absences: 2 }, 'PATCH');
    await send('/tasks', { title: 'Relatório', disciplineId: d.id });
    return d.id;
  });

  await page.goto(`/disciplinas/${id}`);
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar «Redes de Computadores» de forma permanente?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('2 avaliações e as notas registadas são apagadas.');
  await expect(dialog).toContainText('As 2 faltas registadas são apagadas.');
  await expect(dialog).toContainText('A tarefa por fazer fica sem disciplina.');
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // Esc cancela: nada é apagado
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Redes de Computadores' })).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar disciplina' }).click();
  await expect(page).toHaveURL(/\/disciplinas$/);
  await expect(page.getByText('Redes de Computadores')).toBeHidden();
});
