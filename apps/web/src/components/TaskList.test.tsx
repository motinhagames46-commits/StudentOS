import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { TaskList } from './TaskList';

it('mostra o título de cada tarefa e o estado vazio', () => {
  const { rerender } = render(<TaskList tasks={[{ id: 1, title: 'Resumo de Matemática', status: 'TODO' }]} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('Resumo de Matemática')).toBeInTheDocument();

  rerender(<TaskList tasks={[]} />);
  expect(screen.getByText('Sem tarefas pendentes')).toBeInTheDocument();
});

it('assinala tarefas em atraso (RN09)', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  render(<TaskList tasks={[{ id: 1, title: 'Atrasada', status: 'TODO', dueDate: yesterday }]} />);
  expect(screen.getByText(/Em atraso/)).toBeInTheDocument();
});

it('marca como concluída com o checkbox acessível', async () => {
  const onToggle = vi.fn();
  render(<TaskList tasks={[{ id: 7, title: 'Ler', status: 'TODO' }]} onToggle={onToggle} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar "Ler" como concluída' }));
  expect(onToggle).toHaveBeenCalledWith({ id: 7, status: 'DONE' });
});
