import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Providers } from './app/providers';
import { createQueryClient } from './app/queryClient';
import { meOptions } from './features/auth/queries';
import { router } from './app/router';
import { initI18n } from './i18n';
import { useUiStore } from './stores/uiStore';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

void initI18n(useUiStore.getState().locale);

const queryClient = createQueryClient();
void queryClient.prefetchQuery(meOptions);

createRoot(root).render(
  <StrictMode>
    <Providers client={queryClient}>
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
    </Providers>
  </StrictMode>
);
