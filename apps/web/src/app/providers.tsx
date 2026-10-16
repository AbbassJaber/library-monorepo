import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useLocaleSync } from '@/i18n/useLocaleSync';
import { setSessionExpiredHandler } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { applyTheme, useUiStore } from '@/stores/uiStore';
import { createQueryClient } from './queryClient';

const Devtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then(m => ({ default: m.ReactQueryDevtools }))
    )
  : null;

export const Providers = ({ children, client }: { children: ReactNode; client?: QueryClient }) => {
  const [queryClient] = useState(() => client ?? createQueryClient());
  const theme = useUiStore(s => s.theme);

  useEffect(() => applyTheme(theme), [theme]);
  useLocaleSync();
  useEffect(() => {
    setSessionExpiredHandler(() => queryClient.setQueryData(qk.auth.me, null));
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>{children}</ErrorBoundary>
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools initialIsOpen={false} buttonPosition="bottom-left" />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  );
};
