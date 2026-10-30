import { useEffect, useSyncExternalStore } from 'react';
import { slowRequests, wakeServerOnReturn } from '../lib/serverWake';

/** Aviso enquanto há pedidos lentos: explica a espera em vez de deixar a app parecer avariada. */
export function ServerWakeBanner() {
  const slow = useSyncExternalStore(slowRequests.subscribe, slowRequests.count);
  useEffect(() => wakeServerOnReturn(), []);

  // A região existe sempre, para os leitores de ecrã anunciarem o texto quando aparece.
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-4"
    >
      {slow > 0 && (
        <p className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
          A ligar ao servidor… Na primeira utilização do dia pode demorar até um minuto. Não precisas de repetir.
        </p>
      )}
    </div>
  );
}
