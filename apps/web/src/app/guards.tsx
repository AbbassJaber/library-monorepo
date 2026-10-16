import type { Role } from '@library/contracts';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '@/components/ui';
import { useMe } from '@/features/auth/queries';
import { routes } from './routes';

const Loading = () => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-20">
      <Spinner className="size-8 text-fg-2" label={t('auth.loadingSession')} />
    </div>
  );
};

export const RequireAuth = () => {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Loading />;
  if (!me.data)
    return (
      <Navigate to={routes.login} replace state={{ from: location.pathname + location.search }} />
    );
  return <Outlet />;
};

export const RequireRole = ({ requiredRole }: { requiredRole: Role }) => {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (me.data?.role !== requiredRole) return <Navigate to={routes.catalog} replace />;
  return <Outlet />;
};

export const RedirectIfAuthed = () => {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Loading />;
  const from = (location.state as { from?: string } | null)?.from;
  if (me.data) return <Navigate to={from ?? routes.catalog} replace />;
  return <Outlet />;
};
