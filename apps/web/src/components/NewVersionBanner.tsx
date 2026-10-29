import { RefreshCw } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { appVersion } from '../lib/appVersion';

/** Aviso quando o servidor já corre uma versão nova: recarregar traz o código atual. */
export function NewVersionBanner() {
  const outdated = useSyncExternalStore(appVersion.subscribe, appVersion.outdated);
  if (!outdated) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-2">
      <p className="flex flex-wrap items-center gap-3 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
        Há uma versão nova do StudentOS.
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-white px-3 font-medium text-stone-900 hover:bg-stone-100"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Recarregar
        </button>
      </p>
    </div>
  );
}
