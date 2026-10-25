// Conta: mudar a palavra-passe e eliminar a conta (exige email e palavra-passe).
import { expect, test } from '@playwright/test';
import { PASSWORD, register, uniqueEmail } from './helpers';

const NEW_PASSWORD = 'outra-frase-ainda-mais-longa';

test('mudar a palavra-passe e eliminar a conta com confirmação', async ({ page }) => {
  const email = uniqueEmail('conta');
  await register(page, 'Duarte', email);

  await page.goto('/conta');
  await page.getByLabel('Palavra-passe atual').fill('nao-e-esta-de-todo');
  await page.getByLabel('Nova palavra-passe').fill(NEW_PASSWORD);
  await page.getByLabel('Repetir a nova').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Mudar palavra-passe' }).click();
  await expect(page.getByText('A palavra-passe atual está incorreta')).toBeVisible();

  await page.getByLabel('Palavra-passe atual').fill(PASSWORD);
  await page.getByRole('button', { name: 'Mudar palavra-passe' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Palavra-passe alterada' })).toBeVisible();

  // A sessão deste dispositivo continua válida depois da mudança
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Conta' })).toBeVisible();

  const remove = page.getByRole('button', { name: 'Eliminar conta permanentemente' });
  await page.getByLabel(`Escreve ${email} para confirmar`).fill(email);
  await expect(remove).toBeDisabled();
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PASSWORD);
  await remove.click();
  await expect(page.getByText('A palavra-passe está incorreta')).toBeVisible();
  await page.getByLabel('Palavra-passe', { exact: true }).fill(NEW_PASSWORD);
  await remove.click();
  await expect(page).toHaveURL(/\/login/);

  // A conta já não existe
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/incorretos/)).toBeVisible();
});

test('a página de privacidade é pública e descreve o tratamento real dos dados', async ({ page }) => {
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidade' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\[preencher|cifrada/);
  for (const fact of ['hash', 'Render', 'Neon', 'user-agent', 'exportas', 'eliminas a conta'])
    expect(text).toContain(fact);
  // Transferência entre contas: só com código de uso único e confirmação no destino
  await expect(page.getByRole('heading', { level: 2, name: 'Transferir para outra conta' })).toBeVisible();
  expect(text).toMatch(/uma única vez/);
  // Exportação .ics: gerada a pedido, sem link público, e o calendário onde se importa fica com uma cópia
  await expect(page.getByRole('heading', { level: 2, name: 'Exportar para outro calendário' })).toBeVisible();
  for (const fact of [
    '.ics',
    'não fica guardado',
    'nenhum link público',
    'Google Calendar',
    'Outlook',
    'passa a ter uma cópia',
  ])
    expect(text).toContain(fact);
});
