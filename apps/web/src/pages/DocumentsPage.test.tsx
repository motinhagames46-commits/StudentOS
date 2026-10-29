import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import { DocumentsPage } from './DocumentsPage';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

it('envia o PDF em base64 com a disciplina escolhida e abre o documento enquanto a IA o lê', async () => {
  const posted: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return Promise.resolve(json({ id: 7, status: 'PROCESSING', proposals: [] }, 202));
      }
      if (url === '/api/ai/status') return Promise.resolve(json({ status: 'ENABLED' }));
      if (url.startsWith('/api/disciplines')) {
        return Promise.resolve(json([{ id: 3, code: 'BD', name: 'Bases de Dados', color: null, assessments: [] }]));
      }
      return Promise.resolve(json([]));
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/documentos']}>
          <Routes>
            <Route path="/documentos" element={<DocumentsPage />} />
            <Route path="/documentos/:id" element={<p>revisão do documento</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

  const read = await screen.findByRole('button', { name: 'Ler com IA' });
  expect(read).toBeDisabled();
  const pdf = new File(['%PDF-1.4 calendário'], 'calendario.pdf', { type: 'application/pdf' });
  fireEvent.change(container.querySelector('input[multiple]')!, { target: { files: [pdf] } });
  expect(screen.getByRole('list', { name: 'Ficheiros escolhidos' })).toHaveTextContent('1. calendario.pdf');
  await screen.findByRole('option', { name: 'BD — Bases de Dados' });
  fireEvent.change(screen.getByLabelText('Disciplina (opcional)'), { target: { value: '3' } });
  fireEvent.click(read);

  expect(await screen.findByText('revisão do documento')).toBeInTheDocument();
  expect(posted).toEqual([
    {
      files: [
        {
          filename: 'calendario.pdf',
          mimeType: 'application/pdf',
          data: Buffer.from('%PDF-1.4 calendário').toString('base64'),
        },
      ],
      disciplineId: 3,
    },
  ]);
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Documento enviado. A IA está a lê-lo; podes sair desta página.',
    ),
  );
});
