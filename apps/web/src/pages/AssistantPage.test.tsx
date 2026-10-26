import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AssistantPage } from './AssistantPage';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const fromDocuments = {
  mode: 'documents',
  answer: 'A 3FN elimina dependências transitivas [1].',
  sources: [{ kind: 'document', n: 1, documentId: 4, title: 'Apontamentos BD', excerpt: 'A 3FN…' }],
  searchSuggestionsHtml: null,
};
const fromWeb = {
  mode: 'web',
  answer: 'O TCP garante a entrega ordenada.',
  sources: [{ kind: 'web', n: 1, title: 'exemplo.pt', url: 'https://exemplo.pt/tcp' }],
  searchSuggestionsHtml:
    '<style>.chip{color:red}</style><a class="chip" href="https://www.google.com/search?q=tcp">tcp</a>',
};

it('mostra a resposta com fontes, marca a da web e envia a conversa anterior', async () => {
  const posted: { question: string; history?: unknown[] }[] = [];
  const answers = [fromDocuments, fromWeb];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return Promise.resolve(json(answers.shift()));
      }
      return Promise.resolve(json(url === '/api/ai/status' ? { status: 'ENABLED' } : []));
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const box = await screen.findByLabelText('Pergunta');
  fireEvent.change(box, { target: { value: 'O que é a 3FN?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Perguntar' }));
  expect(await screen.findByText(fromDocuments.answer)).toBeInTheDocument();
  expect(screen.getByText('Dos teus documentos')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Apontamentos BD' })).toHaveAttribute('href', '/documentos/4');

  fireEvent.change(box, { target: { value: 'E o TCP?' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(await screen.findByText(fromWeb.answer)).toBeInTheDocument();
  expect(screen.getByText('Fonte web')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /exemplo\.pt/ })).toHaveAttribute('rel', 'noopener noreferrer');
  // Sugestões da Google tal como vêm, isoladas num shadow DOM (sem iframe); a ligação abre noutro separador.
  const suggestions = screen.getByRole('group', { name: 'Sugestões de pesquisa da Google' });
  expect(suggestions.shadowRoot?.innerHTML).toBe(fromWeb.searchSuggestionsHtml);
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  fireEvent.click(suggestions.shadowRoot!.querySelector('a')!);
  expect(open).toHaveBeenCalledWith('https://www.google.com/search?q=tcp', '_blank', 'noopener,noreferrer');
  expect(posted[1]).toMatchObject({
    question: 'E o TCP?',
    history: [
      { role: 'user', text: 'O que é a 3FN?' },
      { role: 'assistant', text: fromDocuments.answer },
    ],
  });
});
