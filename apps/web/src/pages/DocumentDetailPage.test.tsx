import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { ToastProvider } from '../components/Toast';
import { DocumentDetailPage } from './DocumentDetailPage';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const proposal = { time: null, weight: null, minScore: null, evidence: '', duplicate: false };
const doc = {
  id: 1,
  title: 'Calendário de BD',
  source: 'SCAN',
  pageCount: 1,
  createdAt: '2026-10-26T10:00:00.000Z',
  disciplineId: 5,
  pendingProposals: 2,
  text: 'Teste 1: 17 de novembro',
  proposals: [
    {
      ...proposal,
      target: 'assessment',
      title: 'Teste 1',
      date: '2026-11-17',
      assessmentType: 'TEST',
      match: { id: 9, name: 'Teste 1', date: '2026-11-10T09:00:00.000Z' },
    },
    {
      ...proposal,
      target: 'task',
      title: 'Ler o capítulo 4',
      date: '2026-11-20',
      assessmentType: 'OTHER',
      match: null,
    },
  ],
};
const archived = {
  id: 5,
  code: 'BD',
  name: 'Bases de Dados',
  color: null,
  archivedAt: '2026-10-20T10:00:00.000Z',
  assessments: [{ id: 9, name: 'Teste 1', weight: 40, date: '2026-11-10T09:00:00.000Z' }],
};

it('não marca a troca de uma data já existente e mostra a disciplina mesmo arquivada', async () => {
  const posted: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return Promise.resolve(json({ created: 1, updated: 0 }));
      }
      if (url === '/api/documents/1') return Promise.resolve(json(doc));
      if (url === '/api/disciplines?archived=true') return Promise.resolve(json([archived]));
      return Promise.resolve(json([]));
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={['/documentos/1']}>
            <Routes>
              <Route path="/documentos/:id" element={<DocumentDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

  const [assessment, task] = await screen.findAllByRole('checkbox');
  expect(assessment).not.toBeChecked();
  expect(task).toBeChecked();

  fireEvent.click(assessment!);
  const discipline = screen.getAllByLabelText('Disciplina')[0] as HTMLSelectElement;
  expect(discipline.selectedOptions[0]).toHaveTextContent('BD — Bases de Dados (arquivada)');
  const target = screen.getByLabelText('Avaliação') as HTMLSelectElement;
  expect(target.selectedOptions[0]).toHaveTextContent('Atualizar a data de «Teste 1» (40%, atual 10/11/2026)');
  fireEvent.click(assessment!);

  fireEvent.click(screen.getByRole('button', { name: 'Gravar 1 selecionada' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({
    items: [
      {
        target: 'task',
        title: 'Ler o capítulo 4',
        date: '2026-11-20',
        time: null,
        disciplineId: 5,
        assessmentType: 'OTHER',
        weight: null,
        minScore: null,
        assessmentId: null,
      },
    ],
  });
});
