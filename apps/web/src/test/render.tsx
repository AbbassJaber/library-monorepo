import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createQueryClient } from '@/app/queryClient';

export const renderWithProviders = (
  ui: ReactElement,
  options: {
    route?: string | { pathname: string; state: unknown };
    path?: string;
    queryClient?: QueryClient;
    wrapper?: (children: ReactNode) => ReactNode;
  } = {}
) => {
  const queryClient = options.queryClient ?? createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: 0 } });
  const route = options.route ?? '/';
  const path = options.path ?? '*';
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={options.wrapper ? options.wrapper(ui) : ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
};
