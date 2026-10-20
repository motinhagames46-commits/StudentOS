// «Começar agora» (spec §11.7): aceitar a sugestão do painel inicia uma sessão de foco e abre as Sessões.
import { expect, test } from '@playwright/test';
import { register } from './helpers';

const lisbonDay = (offsetDays: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));

test('«Começar agora» inicia o foco com a disciplina da sugestão', async ({ page }) => {
  await register(page, 'Rui');

  await page.goto('/disciplinas');
  await page.getByRole('button', { name: 'Nova disciplina' }).click();
  await page.getByLabel('Nome').fill('Programação Web');
  await page.getByLabel('Sigla').fill('PW');
  await page.getByRole('button', { name: 'Criar disciplina' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Programação Web' })).toBeVisible();

  await page.goto('/tarefas');
  const taskForm = page.locator('form').filter({ has: page.getByLabel('Nova tarefa') });
  await taskForm.getByLabel('Nova tarefa').fill('Relatório do projeto');
  await taskForm.getByLabel('Prazo').fill(lisbonDay(2));
  await taskForm.getByLabel('Disciplina').selectOption({ label: 'PW — Programação Web' });
  await taskForm.getByLabel('Duração (min)').fill('90');
  await taskForm.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByRole('checkbox', { name: 'Marcar "Relatório do projeto" como concluída' })).toBeVisible();

  // Sem sessão planeada para agora, a sugestão é a tarefa mais urgente
  await page.goto('/');
  await expect(page.getByText(/O que estudar agora: .*«Relatório do projeto» \(PW\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Começar agora' }).click();

  await expect(page).toHaveURL(/\/sessoes$/);
  const running = page.locator('p', { hasText: 'Desde as' });
  await expect(running.getByTitle('Programação Web')).toHaveText('PW');
  await expect(page.getByRole('button', { name: 'Parar' })).toBeVisible();

  // Com uma sessão já em curso, o painel explica e leva até ela em vez de criar outra
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar agora' }).click();
  await expect(page.getByRole('alert')).toContainText('Já tens uma sessão de estudo em curso.');
  await page.getByRole('link', { name: 'Ver sessão' }).click();
  await expect(page).toHaveURL(/\/sessoes$/);
});
