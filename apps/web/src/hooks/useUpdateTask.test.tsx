import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import type { Task } from '../lib/types';
import { useUpdateTask } from './queries';

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(patch: () => Promise<Response>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const task = { id: 1, title: 'Ler o capítulo 3', status: 'TODO' } as Task;
  queryClient.setQueryData(['tasks', {}], [task]);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? patch() : Promise.resolve(json(200, [task])),
    ),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateTask(), { wrapper });
  const status = () => queryClient.getQueryData<Task[]>(['tasks', {}])?.[0]?.status;
  return { result, status };
}

it('marcar como feita aparece logo, antes de o servidor responder', async () => {
  const { result, status } = setup(() => new Promise(() => {})); // servidor ainda a acordar
  act(() => {
    result.current.mutate({ id: 1, status: 'DONE' });
  });
  await waitFor(() => expect(status()).toBe('DONE'));
});

it('se o servidor falhar, volta atrás e explica num aviso', async () => {
  const { result, status } = setup(() =>
    Promise.resolve(json(500, { error: { code: 'INTERNAL_ERROR', message: 'Ocorreu um erro inesperado' } })),
  );
  act(() => {
    result.current.mutate({ id: 1, status: 'DONE' });
  });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Não foi possível guardar a tarefa'));
  expect(status()).toBe('TODO');
});

it('edições de formulário (sem estado) não mudam nada antes da resposta nem mostram aviso', async () => {
  const { result, status } = setup(() =>
    Promise.resolve(json(400, { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos' } })),
  );
  await act(async () => {
    await result.current.mutateAsync({ id: 1, title: '' }).catch(() => undefined);
  });
  expect(status()).toBe('TODO');
  expect(screen.queryByText(/Não foi possível guardar/)).not.toBeInTheDocument();
});
