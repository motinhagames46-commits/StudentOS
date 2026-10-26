// Questionário de boas-vindas: cada resposta grava um modelo real e o fim é o plano da semana do planeador.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, register, uniqueEmail } from './helpers';

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }));
  expect(serious).toEqual([]);
}

test('conta nova: questionário até ao plano da semana confirmado', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Rita');
  await page.getByLabel('Email').fill(uniqueEmail('rita'));
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL(/\/boas-vindas$/);
  await expect(page.getByRole('heading', { level: 1, name: /Olá, Rita/ })).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Vamos a isso' }).click();

  // 1. Disciplinas (o foco vai para o título do passo)
  await expect(page.getByRole('heading', { level: 1, name: 'Que disciplinas tens este semestre?' })).toBeFocused();
  await expect(page.getByRole('progressbar', { name: 'Progresso do questionário' })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await page.getByLabel('Nome da disciplina').fill('Programação Web');
  await page.getByLabel('Sigla').fill('PW');
  await page.getByLabel('ECTS').fill('6');
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // 2. Avaliações: modelo predefinido (teste + exame)
  await expect(page.getByRole('heading', { level: 1, name: 'Como é avaliada cada disciplina?' })).toBeFocused();
  await expect(page.getByLabel('PW — Programação Web')).toHaveValue('teste-exame');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // 3. Horas livres: dias úteis ao fim de tarde (predefinido) + sábado à tarde
  await expect(page.getByRole('heading', { level: 1, name: 'Quando podes estudar?' })).toBeFocused();
  await page.getByRole('checkbox', { name: 'Sáb' }).check();
  await page.getByRole('checkbox', { name: 'Tarde (14:00–17:00)' }).check();
  await expect(page.getByText(/Até \d+ h por semana/)).toBeVisible();
  // Compromisso fixo opcional: fica como bloco semanal ocupado
  await page.getByRole('button', { name: 'Adicionar compromisso' }).click();
  await page.getByLabel('Compromisso', { exact: true }).fill('Trabalho');
  await page.getByLabel('Dia', { exact: true }).selectOption({ label: 'Terça' });
  await page.getByLabel('Das', { exact: true }).fill('18:00');
  await page.getByLabel('Às', { exact: true }).fill('22:00');
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // 4. Sessões
  await expect(page.getByRole('heading', { level: 1, name: 'Como gostas de estudar?' })).toBeFocused();
  await expect(page.getByRole('radio', { name: '50 min + 10 de pausa' })).toBeChecked();
  await page.getByRole('button', { name: 'Ver a minha semana' }).click();

  // Resultado: plano real dos próximos 7 dias, nada gravado antes de confirmar
  await expect(page.getByRole('heading', { level: 1, name: 'A tua semana' })).toBeVisible();
  await expect(page.getByText(/\d+ sess(ão|ões) de estudo/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Tempo por disciplina' })).toContainText('PW');
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Confirmar plano' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plano guardado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar ao meu calendário (.ics)' })).toBeVisible();

  await page.getByRole('button', { name: 'Ir para o painel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Olá, Rita' })).toBeVisible();

  const blocks = await page.evaluate(async () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`/api/schedule-blocks?from=${from}&to=${to}`);
    const list = (await res.json()) as { title: string; kind: string; isBusy: boolean }[];
    return [...new Set(list.map((b) => JSON.stringify({ title: b.title, kind: b.kind, isBusy: b.isBusy })))].map(
      (x) => JSON.parse(x) as unknown,
    );
  });
  expect(blocks).toEqual([{ title: 'Trabalho', kind: 'OTHER', isBusy: true }]);

  // As respostas ficaram gravadas: avaliações do modelo e disponibilidade
  await page.goto('/disciplinas');
  await page
    .getByRole('link', { name: /Programação Web/ })
    .first()
    .click();
  await expect(page.getByText('Pesos configurados: 100% de 100%')).toBeVisible();
});

test('o questionário pode ser saltado logo no início', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Tiago');
  await page.getByLabel('Email').fill(uniqueEmail('tiago'));
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Saltar e ir para o painel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Olá, Tiago' })).toBeVisible();
});

test('se gravar uma disciplina falhar, tentar de novo não duplica as que já ficaram gravadas', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Inês');
  await page.getByLabel('Email').fill(uniqueEmail('ines'));
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Vamos a isso' }).click();

  await page.getByLabel('Nome da disciplina', { exact: true }).fill('Programação Web');
  await page.getByLabel('Sigla', { exact: true }).fill('PW');
  await page.getByRole('button', { name: 'Outra disciplina' }).click();
  await page.getByLabel('Nome da disciplina 2').fill('Bases de Dados');
  await page.getByLabel('Sigla 2').fill('BD');

  // O segundo pedido falha uma vez (simulado)
  let posts = 0;
  await page.route('**/api/disciplines', (route) =>
    route.request().method() === 'POST' && ++posts === 2
      ? route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'Falha simulada' } } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha simulada');
  await expect(page.getByLabel('Nome da disciplina', { exact: true })).toHaveValue('Bases de Dados');

  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Como é avaliada cada disciplina?' })).toBeVisible();
  const codes = await page.evaluate(async () =>
    ((await (await fetch('/api/disciplines')).json()) as { code: string }[]).map((d) => d.code).sort(),
  );
  expect(codes).toEqual(['BD', 'PW']);
});

test('no calendário, «Compromisso fixo» já vem semanal e ocupado', async ({ page }) => {
  await register(page, 'Vasco');
  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Compromisso fixo' }).click();
  await expect(page.getByRole('heading', { name: 'Novo compromisso fixo' })).toBeVisible();
  await expect(page.getByLabel('Tipo')).toHaveValue('OTHER');
  await expect(page.getByLabel('Repetir até')).not.toHaveValue('');
  await expect(page.getByRole('checkbox', { name: /Ocupado/ })).toBeChecked();
});

test('se a proposta deixar de valer, «Gerar de novo» faz outra e confirma-se', async ({ page }) => {
  await register(page, 'Lara');
  // Dados pela API: uma disciplina com avaliações e disponibilidade todo o dia
  await page.evaluate(async () => {
    const post = (path: string, body: unknown, method = 'POST') =>
      fetch(`/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<{ id: number }>);
    const d = await post('/disciplines', { name: 'Bases de Dados', code: 'BD', ects: 6 });
    await post(`/disciplines/${d.id}/assessments`, { name: 'Exame', type: 'EXAM', weight: 100 });
    const allDay = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }));
    await post(
      '/preferences/study',
      { sessionMinutes: 50, minSessionMinutes: 25, breakMinutes: 10, maxDailyMinutes: 180, availability: allDay },
      'PUT',
    );
  });

  await page.goto('/boas-vindas');
  await page.getByRole('button', { name: 'Vamos a isso' }).click();
  await page.getByRole('button', { name: 'Saltar este passo' }).click();
  await page.getByRole('button', { name: 'Saltar este passo' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click(); // mantém a disponibilidade
  await page.getByRole('button', { name: 'Ver a minha semana' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar plano' })).toBeVisible();

  // Entretanto o calendário muda: um evento ocupado em cima da primeira sessão proposta
  await page.evaluate(async () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const { draft } = (await (await fetch(`/api/planner/sessions?from=${from}&to=${to}`)).json()) as {
      draft: { proposal: { sessions: { start: string; end: string }[] } };
    };
    const first = draft.proposal.sessions[0]!;
    await fetch('/api/schedule-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Reunião', kind: 'EVENT', startAt: first.start, endAt: first.end }),
    });
  });

  await page.getByRole('button', { name: 'Confirmar plano' }).click();
  await expect(page.getByRole('alert')).toContainText('Esta proposta já não se pode confirmar');
  await page.getByRole('button', { name: 'Gerar de novo' }).click();
  await page.getByRole('button', { name: 'Confirmar plano' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plano guardado' })).toBeVisible();
});
