// Fluxo principal (secção 14): registo → disciplina → avaliações → nota necessária → tarefa → concluir.
import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers';

async function addAssessment(
  page: Page,
  a: { name: string; type: string; weight: string; score?: string; minScore?: string },
) {
  // Sem avaliações, o botão aparece também no estado vazio
  await page.getByRole('button', { name: 'Adicionar avaliação' }).first().click();
  const form = page.locator('form').filter({ has: page.getByLabel('Peso (%)') });
  await form.getByLabel('Nome').fill(a.name);
  await form.getByLabel('Tipo').selectOption({ label: a.type });
  await form.getByLabel('Peso (%)').fill(a.weight);
  if (a.score) await form.getByLabel('Nota', { exact: true }).fill(a.score);
  if (a.minScore) await form.getByLabel('Nota mínima').fill(a.minScore);
  await form.getByRole('button', { name: 'Adicionar' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('button', { name: `Editar "${a.name}"` })).toBeVisible();
}

test('registo, disciplina, avaliações, nota necessária e tarefa concluída', async ({ page }) => {
  await register(page, 'Ana');

  // Criar disciplina
  await page.goto('/disciplinas');
  await page.getByRole('button', { name: 'Nova disciplina' }).click();
  await page.getByLabel('Nome').fill('Programação Web');
  await page.getByLabel('Sigla').fill('PW');
  await page.getByLabel('ECTS').fill('6');
  await page.getByRole('button', { name: 'Criar disciplina' }).click();
  await expect(page).toHaveURL(/\/disciplinas\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Programação Web' })).toBeVisible();

  // Exemplo 4.1: 30% com 12, 30% com 15 e exame de 40% com nota mínima 8
  await addAssessment(page, { name: 'Teste 1', type: 'Teste', weight: '30', score: '12' });
  await addAssessment(page, { name: 'Projeto', type: 'Projeto', weight: '30', score: '15' });
  await addAssessment(page, { name: 'Exame', type: 'Exame', weight: '40', minScore: '8' });

  await expect(page.getByText('Pesos configurados: 100% de 100%')).toBeVisible();
  await expect(page.getByText('Para passar precisas de 8,0')).toBeVisible();

  // Criar tarefa associada à disciplina
  await page.goto('/tarefas');
  const taskForm = page.locator('form').filter({ has: page.getByLabel('Nova tarefa') });
  await taskForm.getByLabel('Nova tarefa').fill('Resumo do capítulo 3');
  await taskForm.getByLabel('Disciplina').selectOption({ label: 'PW — Programação Web' });
  await taskForm.getByRole('button', { name: 'Adicionar' }).click();

  const checkbox = page.getByRole('checkbox', { name: 'Marcar "Resumo do capítulo 3" como concluída' });
  await expect(checkbox).toBeVisible();

  // Concluir: sai da lista "Por fazer" e aparece em "Concluídas"
  await checkbox.click();
  await expect(checkbox).toBeHidden();
  await page.getByRole('radio', { name: 'Concluídas' }).click();
  await expect(page.getByRole('checkbox', { name: 'Reabrir "Resumo do capítulo 3"' })).toBeChecked();
});
