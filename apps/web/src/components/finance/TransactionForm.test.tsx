import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../Toast';
import { TransactionForm } from './TransactionForm';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

it('lê «12,5» como 1250 cêntimos e recusa um valor que não é dinheiro', async () => {
  const posted: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return Promise.resolve(json({ id: 1 }, 201));
      }
      return Promise.resolve(json([]));
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <TransactionForm month="2026-10" />
      </ToastProvider>
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('Valor (€)'), { target: { value: 'doze' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registar' }));
  expect(await screen.findByText('Indica o valor em euros (ex.: 12,50)')).toBeInTheDocument();
  expect(posted).toHaveLength(0);

  fireEvent.click(screen.getByLabelText('Receita'));
  fireEvent.change(screen.getByLabelText('Valor (€)'), { target: { value: '12,5' } });
  fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-20' } });
  fireEvent.change(screen.getByLabelText('Categoria (opcional)'), { target: { value: ' Bolsa ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registar' }));
  await waitFor(() =>
    expect(posted).toEqual([
      { kind: 'INCOME', amountCents: 1250, occurredOn: '2026-10-20', category: 'Bolsa', note: null },
    ]),
  );
  expect(await screen.findByText('Receita registada.')).toBeInTheDocument();
});
