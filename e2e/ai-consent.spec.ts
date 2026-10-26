// IA (Gemini): só a conta autorizada no servidor vê o consentimento; nas outras nada é enviado a fornecedores de IA.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers';

const aiCard = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Assistente de IA (Gemini)' }) });

test('conta autorizada: ativar e desligar a IA com consentimento registado', async ({ page }) => {
  await register(page, 'Dono', process.env.E2E_AI_EMAIL);
  await page.goto('/integracoes');
  const card = aiCard(page);
  await expect(card.getByText('Não configurada')).toBeVisible();
  await expect(card).toContainText('Falta a chave do Gemini no servidor');

  await card.getByRole('button', { name: 'Ativar a IA (aceito)' }).click();
  await expect(card.getByText(/Ativada em/)).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await card.getByRole('button', { name: 'Desligar a IA' }).click();
  await expect(card.getByRole('button', { name: 'Ativar a IA (aceito)' })).toBeVisible();

  // Documentos: a secção aparece a esta conta, mas sem IA ativa não deixa enviar nada.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('link', { name: 'Documentos' }).click();
  await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
  await expect(page.getByText('Para ler documentos, ativa primeiro o assistente de IA.')).toBeVisible();
  await expect(page.getByText('Ainda não tens documentos.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ler com IA' })).toHaveCount(0);
  const docs = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(docs.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('outra conta: IA indisponível e sem botão para a ativar', async ({ page }) => {
  await register(page, 'Colega');
  await page.goto('/integracoes');
  const card = aiCard(page);
  await expect(card).toContainText('Não disponível nesta conta');
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Documentos' })).toHaveCount(0);
});
