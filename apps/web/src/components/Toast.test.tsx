import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastOptions } from './Toast';

function Trigger(options: ToastOptions) {
  const show = useToast();
  return <button onClick={() => show(options)}>mostrar</button>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const open = (options: ToastOptions) => {
  render(
    <ToastProvider>
      <Trigger {...options} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText('mostrar'));
};

it('anuncia o aviso numa região aria-live e fecha-o sozinho ao fim do tempo', () => {
  const onClose = vi.fn();
  open({ message: 'Guardado', duration: 2000, onClose });
  expect(screen.getByRole('status')).toHaveTextContent('Guardado');
  act(() => {
    vi.advanceTimersByTime(2100);
  });
  expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  expect(onClose).toHaveBeenCalledWith('timeout');
});

it('a ação corre uma vez e fecha o aviso, sem passar pelo fim do tempo', () => {
  const onUndo = vi.fn();
  const onClose = vi.fn();
  open({ message: 'Tarefa eliminada', action: { label: 'Desfazer', onClick: onUndo }, onClose });
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledWith('action');
  act(() => {
    vi.advanceTimersByTime(20_000);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('o tempo pára enquanto o rato está em cima (WCAG 2.2.1) e retoma depois', () => {
  open({ message: 'Tarefa eliminada', action: { label: 'Desfazer', onClick: () => {} } });
  const toast = screen.getByText('Tarefa eliminada').parentElement!;
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  fireEvent.mouseEnter(toast);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Tarefa eliminada')).toBeInTheDocument();
  fireEvent.mouseLeave(toast);
  act(() => {
    vi.advanceTimersByTime(6100);
  });
  expect(screen.queryByText('Tarefa eliminada')).not.toBeInTheDocument();
});

it('fechar à mão conta como «dismiss»', () => {
  const onClose = vi.fn();
  open({ message: 'Aviso', onClose });
  fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
  expect(onClose).toHaveBeenCalledWith('dismiss');
});
