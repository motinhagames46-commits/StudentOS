// Cenário do spec §15.3: conta → disciplinas → tarefa e avaliação → importar .ics com pré-visualização →
// calendário → disponibilidade → proposta de plano → confirmar sem conflitos → retirar sessão →
// integrações com estado honesto. (Concluir/falhar sessões e replanear exigem sessões já começadas:
// estão cobertos nos testes de integração da API, apps/api/test/planner.test.ts.)
import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers';

const lisbonDay = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
};

function icsWithDailyClass() {
  const start = lisbonDay(1).replace(/-/g, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudentOS E2E//PT',
    'BEGIN:VEVENT',
    'UID:e2e-aula-diaria',
    'SUMMARY:Aula E2E',
    `DTSTART;TZID=Europe/Lisbon:${start}T180000`,
    `DTEND;TZID=Europe/Lisbon:${start}T190000`,
    'RRULE:FREQ=DAILY;COUNT=10',
    'LOCATION:Sala 1',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

async function createDiscipline(page: Page, name: string, code: string) {
  await page.goto('/disciplinas');
  await page.getByRole('button', { name: 'Nova disciplina' }).click();
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('Sigla').fill(code);
  await page.getByRole('button', { name: 'Criar disciplina' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('importar horário, definir disponibilidade e confirmar um plano sem conflitos', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await register(page, 'Bia');

  await createDiscipline(page, 'Programação Web', 'PW');
  await createDiscipline(page, 'Bases de Dados', 'BD');

  // Avaliação com tempo de preparação
  await page.getByRole('button', { name: 'Adicionar avaliação' }).first().click();
  const assessmentForm = page.locator('form').filter({ has: page.getByLabel('Peso (%)') });
  await assessmentForm.getByLabel('Nome').fill('Teste 1');
  await assessmentForm.getByLabel('Peso (%)').fill('40');
  await assessmentForm.getByLabel('Data').fill(lisbonDay(6));
  await assessmentForm.getByLabel('Preparação estimada (min)').fill('120');
  await assessmentForm.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Preparação ~120 min')).toBeVisible();

  // Tarefa com duração estimada
  await page.goto('/tarefas');
  const taskForm = page.locator('form').filter({ has: page.getByLabel('Nova tarefa') });
  await taskForm.getByLabel('Nova tarefa').fill('Relatório de BD');
  await taskForm.getByLabel('Prazo').fill(lisbonDay(4));
  await taskForm.getByLabel('Disciplina').selectOption({ label: 'BD — Bases de Dados' });
  await taskForm.getByLabel('Duração (min)').fill('100');
  await taskForm.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('~100 min')).toBeVisible();

  // Importar .ics: pré-visualização antes de gravar
  await page.goto('/importar');
  await page.locator('input[type=file]').setInputFiles({
    name: 'horario.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(icsWithDailyClass()),
  });
  await expect(page.getByText('Pré-visualização — horario.ics')).toBeVisible();
  await expect(page.getByText(/Diária.*até/)).toBeVisible();
  await page.getByRole('button', { name: 'Importar 1' }).click();
  await expect(page.getByText('Importação concluída')).toBeVisible();

  // O calendário mostra as aulas importadas
  await page.goto('/calendario');
  const aula = page.getByRole('button', { name: /^Aula E2E, 18:00–19:00/ }).first();
  if ((await aula.count()) === 0) await page.getByRole('button', { name: 'Semana seguinte' }).click();
  await expect(aula).toBeVisible();

  // Disponibilidade
  await page.goto('/preferencias');
  await page.getByRole('button', { name: 'Dias úteis 18:00–21:00' }).click();
  await page.getByRole('button', { name: 'Fim de semana 10:00–13:00' }).click();
  await page.getByRole('button', { name: 'Guardar preferências' }).click();
  await expect(page.getByText('Preferências guardadas.')).toBeVisible();

  // Proposta → confirmação
  await page.goto('/plano');
  await page.getByRole('button', { name: 'Gerar plano (7 dias)' }).click();
  await expect(page.getByText(/Proposta de plano \(versão 1\)/)).toBeVisible();
  await expect(page.getByText(/Tarefa «Relatório de BD» \(BD\)/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar plano' }).click();
  await expect(page.getByText(/Proposta de plano/)).toBeHidden();

  // Nenhuma sessão planeada se sobrepõe às aulas ocupadas
  const overlaps = await page.evaluate(async () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const [plan, cal] = await Promise.all([
      fetch(`/api/planner/sessions?${q}`).then((r) => r.json()),
      fetch(`/api/calendar?${q}`).then((r) => r.json()),
    ]);
    const busy = cal.blocks.filter((b: { isBusy: boolean }) => b.isBusy);
    const sessions = plan.sessions as { startAt: string; endAt: string }[];
    return {
      count: sessions.length,
      conflicts: sessions.filter((s) =>
        busy.some((b: { start: string; end: string }) => s.startAt < b.end && b.start < s.endAt),
      ).length,
    };
  });
  expect(overlaps.count).toBeGreaterThan(0);
  expect(overlaps.conflicts).toBe(0);

  // Retirar uma sessão do plano
  const before = await page.getByRole('button', { name: 'Retirar' }).count();
  await page.getByRole('button', { name: 'Retirar' }).first().click();
  await expect(page.getByRole('button', { name: 'Retirar' })).toHaveCount(before - 1);

  // Integrações: estado honesto, nunca "Ligado"
  await page.goto('/integracoes');
  await expect(page.getByText('Não ligado — indisponível nesta versão')).toHaveCount(2);
  await expect(page.getByText('Ligado', { exact: true })).toHaveCount(0);
});
