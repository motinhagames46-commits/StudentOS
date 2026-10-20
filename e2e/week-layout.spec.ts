// Regressão: um prazo com título longo não pode empurrar os prazos dos dias seguintes para a coluna errada.
import { expect, test } from '@playwright/test';
import { register } from './helpers';

const lisbon = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', ...opts }).format(d);

/** Segunda e quarta-feira da próxima semana, em Lisboa. */
function nextWeekDays() {
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    if (lisbon(d, { weekday: 'short' }) === 'Mon') {
      const wed = new Date(d.getTime() + 2 * 24 * 60 * 60 * 1000);
      const key = (x: Date) => lisbon(x, { year: 'numeric', month: '2-digit', day: '2-digit' });
      return { monday: key(d), wednesday: key(wed) };
    }
  }
  throw new Error('sem segunda-feira');
}

test('os prazos ficam na coluna do seu dia mesmo com títulos longos', async ({ page }) => {
  await register(page, 'Rita');
  const { monday, wednesday } = nextWeekDays();
  const status = await page.evaluate(
    async (tasks) => {
      const codes = [];
      for (const t of tasks) {
        const r = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        codes.push(r.status);
      }
      return codes;
    },
    [
      {
        title: 'Rever o capítulo inteiro de React hooks com todos os exemplos e exercícios',
        dueDate: `${monday}T12:00:00.000Z`,
      },
      { title: 'Curta', dueDate: `${wednesday}T12:00:00.000Z` },
    ],
  );
  expect(status).toEqual([201, 201]);

  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Semana seguinte' }).click();
  const header = page.getByText(`Qua ${Number(wednesday.slice(8))}`, { exact: true });
  const deadline = page.locator('li[title*="Curta"]:visible');
  await expect(deadline).toBeVisible();
  const h = (await header.boundingBox())!;
  const d = (await deadline.boundingBox())!;
  const center = d.x + d.width / 2;
  expect(center).toBeGreaterThan(h.x);
  expect(center).toBeLessThan(h.x + h.width);
});
