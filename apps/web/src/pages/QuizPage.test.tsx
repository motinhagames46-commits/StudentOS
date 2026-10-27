import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { QuizPage } from './QuizPage';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const base = {
  id: 3,
  topic: 'Normalização',
  createdAt: '2026-10-27T09:00:00.000Z',
  questionCount: 2,
  disciplineId: null,
  documentId: 1,
};
const open = {
  ...base,
  answeredAt: null,
  score: null,
  questions: [
    { kind: 'MCQ', question: 'Qual elimina dependências transitivas?', options: ['2FN', '3FN'] },
    { kind: 'SHORT', question: 'O que é uma FK?', options: [] },
  ],
};
const graded = {
  ...base,
  answeredAt: '2026-10-27T09:05:00.000Z',
  score: 50,
  questions: [
    {
      ...open.questions[0],
      correctOption: 1,
      expectedAnswer: null,
      explanation: 'A 3FN.',
      answer: { choice: 0, text: null },
      verdict: 'wrong',
      feedback: null,
    },
    {
      ...open.questions[1],
      correctOption: null,
      expectedAnswer: 'Referência a outra tabela',
      explanation: '',
      answer: { choice: null, text: 'liga tabelas' },
      verdict: 'correct',
      feedback: 'Boa.',
    },
  ],
};

it('envia as respostas pela ordem e mostra a correção com a resposta certa', async () => {
  const posted: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return Promise.resolve(json(graded));
      }
      return Promise.resolve(json(open));
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/revisoes/quiz/3']}>
        <Routes>
          <Route path="/revisoes/quiz/:id" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('radio', { name: '2FN' }));
  fireEvent.change(screen.getByLabelText('2. O que é uma FK?'), { target: { value: ' liga tabelas ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Corrigir' }));

  await waitFor(() =>
    expect(posted).toEqual([
      {
        answers: [
          { choice: 0, text: null },
          { choice: null, text: 'liga tabelas' },
        ],
      },
    ]),
  );
  expect(await screen.findByText('Resultado: 50% certas')).toBeInTheDocument();
  expect(screen.getByText('Errada')).toBeInTheDocument();
  expect(screen.getByText('Certa')).toBeInTheDocument();
  expect(screen.getByText('3FN')).toBeInTheDocument(); // a certa, mostrada depois de errar
});
