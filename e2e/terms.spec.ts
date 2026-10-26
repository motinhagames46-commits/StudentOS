// Termos de utilização: página pública e aceitação obrigatória (com a idade) para criar conta.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PASSWORD, uniqueEmail } from './helpers';

test('sem aceitar os Termos não se cria conta; a página dos Termos é pública e acessível', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Duarte');
  await page.getByLabel('Email').fill(uniqueEmail('termos'));
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Para criar conta, confirma a idade e aceita os Termos de utilização')).toBeVisible();
  await expect(page).toHaveURL(/\/registo$/);

  await page.goto('/termos');
  await expect(page.getByRole('heading', { level: 1, name: 'Termos de utilização' })).toBeVisible();
  await expect(page.getByText(/Versão de \d+ de \w+ de \d{4}/)).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
