import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui';

// Confirmação dentro da app, em vez do window.confirm do browser (que no telemóvel parece um erro).
// <dialog> nativo com showModal(): foco preso no diálogo, Esc cancela e o foco volta ao botão de origem.

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
}

interface Request extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/** `if (await confirm({ … })) …` — resolve `true` só se a pessoa confirmar. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm fora do ConfirmProvider');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  useEffect(() => {
    if (!request) return;
    if (!dialog.current?.open) dialog.current?.showModal();
    // O foco começa em «Cancelar»: confirmar por engano custa mais do que cancelar.
    cancel.current?.focus();
  }, [request]);

  const finish = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
    dialog.current?.close();
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={request?.message ? messageId : undefined}
        onCancel={(e) => {
          e.preventDefault();
          finish(false);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-panel-border bg-white p-0 shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        {request && (
          <div className="p-5">
            <h2 id={titleId} className="text-lg font-semibold text-stone-900">
              {request.title}
            </h2>
            {request.message && (
              <div id={messageId} className="mt-2 space-y-2 text-sm text-stone-700">
                {request.message}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button ref={cancel} variant="secondary" onClick={() => finish(false)}>
                Cancelar
              </Button>
              <Button variant={request.tone === 'primary' ? 'primary' : 'danger'} onClick={() => finish(true)}>
                {request.confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
