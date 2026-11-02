// Queixa real: «não é possível criar plano de estudo automático» com as avaliações das fichas de UC
// (sem datas nem tempo de estudo). O plano usa o ritmo predefinido (60 h por disciplina × peso); os ECTS, mesmo
// gravados, já não contam (conselho de 2026-11-02).
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('avaliações sem data nem tempo de estudo: plano pelo ritmo predefinido, com ou sem ECTS', async ({ page }) => {
  await register(page, 'Tiago');
  const status = await page.evaluate(async () => {
    const post = (url: string, body: unknown, method = 'POST') =>
      fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const codes: number[] = [];
    const withEcts = await post('/api/disciplines', { name: 'Tecnologias Multimédia', code: 'TDM', ects: 6 });
    const noEcts = await post('/api/disciplines', { name: 'Inglês Técnico', code: 'IT' });
    codes.push(withEcts.status, noEcts.status);
    const a = (await withEcts.json()) as { id: number };
    const b = (await noEcts.json()) as { id: number };
    for (const [id, name, type, weight] of [
      [a.id, 'Frequência', 'TEST', 60],
      [a.id, 'Projeto', 'PROJECT', 40],
      [b.id, 'Exame', 'EXAM', 100],
    ] as const) {
      codes.push((await post(`/api/disciplines/${id}/assessments`, { name, type, weight })).status);
    }
    const availability = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));
    const prefs = { sessionMinutes: 50, minSessionMinutes: 25, breakMinutes: 10, maxDailyMinutes: 180, availability };
    codes.push((await post('/api/preferences/study', prefs, 'PUT')).status);
    return codes;
  });
  expect(status).toEqual([201, 201, 201, 201, 201, 200]);

  await page.goto('/plano');
  await page.getByRole('button', { name: 'Gerar plano (7 dias)' }).click();
  await expect(page.getByText(/Proposta de plano/)).toBeVisible();
  await expect(page.getByText('3 com tempo predefinido')).toBeVisible();
  await expect(page.getByText(/ritmo predefinido: 100 % de 60 h/).first()).toBeVisible();
  await expect(page.getByText(/ECTS/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar plano' })).toBeEnabled();
});
