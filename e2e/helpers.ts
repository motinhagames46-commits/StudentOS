import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'uma-frase-facil-de-lembrar';

/** Email único por teste, para os testes não dependerem do estado da base de dados. */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

/** Cria uma conta pela página de registo e espera pelo painel. */
export async function register(page: Page, name: string) {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('Email').fill(uniqueEmail(name.toLowerCase()));
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Olá, ${name}` })).toBeVisible();
}
