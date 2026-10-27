import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { ToastProvider } from '../components/Toast';
import { ReviewsPage } from './ReviewsPage';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const card = { due: '2026-10-27T09:00:00.000Z', disciplineId: null, explanation: 'Porque sim.' };
const queue = {
  dueCount: 2,
  nextDue: null,
  cards: [
    {
      ...card,
      id: 1,
      kind: 'MCQ',
      question: 'Qual a 3FN?',
      options: ['A', 'B'],
      correctOption: 1,
      expectedAnswer: null,
    },
    {
      ...card,
      id: 2,
      kind: 'SHORT',
      question: 'O que é uma FK?',
      options: [],
      correctOption: null,
      expectedAnswer: 'Referência',
    },
  ],
};

it('revê escolha múltipla (corrigida no browser) e resposta curta (autoavaliada), registando cada revisão', async () => {
  const rated: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        rated.push({ url, body: JSON.parse(String(init.body)) });
        return Promise.resolve(json({ due: '2026-10-28T09:00:00.000Z', retention: 0.9 }));
      }
      if (url === '/api/reviews') return Promise.resolve(json(queue));
      if (url === '/api/ai/status') return Promise.resolve(json({ status: 'NOT_CONFIGURED' }));
      return Promise.resolve(json([]));
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter>
            <ReviewsPage />
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('2 perguntas à tua espera.')).toBeInTheDocument();
  expect(screen.getByText('Para criar quizzes, ativa primeiro o assistente de IA.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Começar revisão' }));

  fireEvent.click(screen.getByRole('button', { name: 'A' }));
  expect(screen.getByText('Não é essa.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Seguinte' }));

  fireEvent.click(await screen.findByRole('button', { name: 'Ver resposta' }));
  expect(screen.getByText('Referência')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Difícil' }));

  await waitFor(() => expect(rated).toHaveLength(2));
  expect(rated).toEqual([
    { url: '/api/reviews/1', body: { rating: 1 } },
    { url: '/api/reviews/2', body: { rating: 2 } },
  ]);
  expect(await screen.findByText('Revisão feita. As próximas datas já estão marcadas.')).toBeInTheDocument();
});
