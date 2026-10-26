import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slowRequests, trackSlow, wakeServerOnReturn } from './serverWake';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pedidos lentos (servidor a acordar)', () => {
  it('um pedido rápido nunca conta; um lento conta a partir dos 3 s até terminar', async () => {
    const fast = deferred();
    const tracked = trackSlow(fast.promise);
    await vi.advanceTimersByTimeAsync(1000);
    fast.resolve();
    await tracked;
    await vi.advanceTimersByTimeAsync(5000);
    expect(slowRequests.count()).toBe(0);

    const slow = deferred();
    const slowTracked = trackSlow(slow.promise);
    await vi.advanceTimersByTimeAsync(3000);
    expect(slowRequests.count()).toBe(1);
    slow.resolve();
    await slowTracked;
    expect(slowRequests.count()).toBe(0);
  });

  it('um pedido lento que falha também deixa de contar', async () => {
    const failing = deferred();
    const tracked = trackSlow(failing.promise).catch(() => 'falhou');
    await vi.advanceTimersByTimeAsync(4000);
    expect(slowRequests.count()).toBe(1);
    failing.reject(new Error('rede'));
    expect(await tracked).toBe('falhou');
    expect(slowRequests.count()).toBe(0);
  });
});

describe('acordar o servidor ao voltar ao separador', () => {
  let state: DocumentVisibilityState = 'visible';
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  });
  const setVisibility = (next: DocumentVisibilityState) => {
    state = next;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('só pede /api/health depois de 10+ minutos escondido', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const stop = wakeServerOnReturn();

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    setVisibility('visible');
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    setVisibility('visible');
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
    stop();
  });
});
