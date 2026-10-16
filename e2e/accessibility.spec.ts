// Verificação de acessibilidade com axe (secção 14): sem violações sérias ou críticas.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers';

/** Pedido à API a partir da página, com o cookie de sessão do utilizador. */
async function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  return page.evaluate(
    async ({ path, body }) => {
      const res = await fetch(`/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
      return res.json();
    },
    { path, body },
  ) as Promise<T>;
}

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }));
  expect(serious).toEqual([]);
}

test.describe('acessibilidade (axe)', () => {
  let disciplineId: number;

  test.beforeEach(async ({ page }) => {
    await register(page, 'Bruno');

    // Dados para as páginas não estarem vazias
    const d = await apiPost<{ id: number }>(page, '/disciplines', { name: 'Matemática Discreta', code: 'MD', ects: 6 });
    disciplineId = d.id;
    await apiPost(page, `/disciplines/${d.id}/assessments`, { name: 'Teste 1', type: 'TEST', weight: 30, score: 12 });
    await apiPost(page, `/disciplines/${d.id}/assessments`, { name: 'Teste 2', type: 'TEST', weight: 30, score: 15 });
    await apiPost(page, `/disciplines/${d.id}/assessments`, { name: 'Exame', type: 'EXAM', weight: 40, minScore: 8 });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await apiPost(page, '/tasks', {
      title: 'Fichas de exercícios',
      disciplineId: d.id,
      dueDate: tomorrow,
      priority: 'HIGH',
    });
  });

  test('painel', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Fichas de exercícios')).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('tarefas', async ({ page }) => {
    await page.goto('/tarefas');
    await expect(page.getByRole('checkbox', { name: /Fichas de exercícios/ })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('detalhe da disciplina', async ({ page }) => {
    await page.goto(`/disciplinas/${disciplineId}`);
    await expect(page.getByText('Para passar precisas de 8,0')).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});
