import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';

// O jsdom tem <dialog> mas não showModal/close; no browser real o comportamento é coberto pelo E2E.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

function Harness() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState('—');
  async function ask() {
    const ok = await confirm({
      title: 'Eliminar «Teste»?',
      message: 'A nota é apagada.',
      confirmLabel: 'Eliminar',
    });
    setAnswer(ok ? 'sim' : 'não');
  }
  return (
    <>
      <button onClick={() => void ask()}>abrir</button>
      <p>resposta: {answer}</p>
    </>
  );
}

const open = () => {
  render(
    <ConfirmProvider>
      <Harness />
    </ConfirmProvider>,
  );
  fireEvent.click(screen.getByText('abrir'));
};

it('confirmar resolve «sim»; o diálogo tem título, descrição e foco em Cancelar', async () => {
  open();
  const dialog = await screen.findByRole('dialog', { name: 'Eliminar «Teste»?' });
  expect(dialog).toHaveAccessibleDescription('A nota é apagada.');
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  await waitFor(() => expect(screen.getByText('resposta: sim')).toBeInTheDocument());
});

it('Cancelar e Esc resolvem «não»', async () => {
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.getByText('resposta: não')).toBeInTheDocument());

  fireEvent.click(screen.getByText('abrir'));
  const dialog = await screen.findByRole('dialog', { name: 'Eliminar «Teste»?' });
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('resposta: não')).toBeInTheDocument();
});
