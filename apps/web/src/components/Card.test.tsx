import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { Card } from './ui';

afterEach(() => localStorage.clear());

it('recolhe e expande o painel, e lembra-se da escolha neste browser', async () => {
  const { unmount } = render(
    <Card collapsible title="Próximos 7 dias">
      <p>Conteúdo</p>
    </Card>,
  );
  const toggle = screen.getByRole('button', { name: 'Recolher «Próximos 7 dias»' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await userEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Expandir «Próximos 7 dias»' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Conteúdo')).not.toBeVisible();

  unmount();
  render(
    <Card collapsible title="Próximos 7 dias">
      <p>Conteúdo</p>
    </Card>,
  );
  expect(screen.queryByText('Conteúdo')).not.toBeVisible();
});

it('sem collapsible não há botão de recolher', () => {
  render(
    <Card title="Plano de hoje">
      <p>Conteúdo</p>
    </Card>,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByText('Conteúdo')).toBeVisible();
});
