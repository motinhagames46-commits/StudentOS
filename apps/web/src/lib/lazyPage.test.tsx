import { render, screen } from '@testing-library/react';
import { Component, Suspense, type ComponentType, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { lazyPage } from './lazyPage';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p>erro visível</p> : this.props.children;
  }
}

const mount = (Page: ComponentType) =>
  render(
    <Boundary>
      <Suspense fallback="a carregar">
        <Page />
      </Suspense>
    </Boundary>,
  );

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('carrega a página pelo nome exportado', async () => {
  mount(lazyPage(() => Promise.resolve({ Ola: () => <p>Olá</p> }), 'Ola'));
  expect(await screen.findByText('Olá')).toBeInTheDocument();
});

it('se o ficheiro da página desapareceu (nova versão), recarrega uma única vez', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  const failing = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));

  const first = mount(lazyPage(failing, 'Pagina'));
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  first.unmount();

  // Já recarregou nesta sessão: não entra em ciclo, o erro segue para a interface
  mount(lazyPage(failing, 'Pagina'));
  expect(await screen.findByText('erro visível')).toBeInTheDocument();
  expect(reload).toHaveBeenCalledTimes(1);
});
