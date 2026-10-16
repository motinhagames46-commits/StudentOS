import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../hooks/useAuth';
import { errorMessage } from '../lib/api';
import { ErrorState } from './ui';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="A carregar">
      <Loader2 aria-hidden="true" className="size-6 animate-spin text-stone-400" />
    </div>
  );
}

export function RequireAuth() {
  const { data, isPending, error, refetch } = useMe();
  const location = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
