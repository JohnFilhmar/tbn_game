import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { APP_ROUTES } from '@/app/routes';
import type { ApiClient } from '@/lib/api/apiClient';
import { clearToken, saveToken } from '@/lib/session/tokenStorage';
import { AppProviders } from '@/providers/AppProviders';

/** How a test opens the desktop. */
export interface RenderAppOptions {
  api: ApiClient;
  /** The address inside `/app`, such as `/reports`. */
  path: string;
  isSignedIn?: boolean;
}

/** Renders the whole client at one address with a fake API and no network. */
export function renderApp({ api, path, isSignedIn = true }: RenderAppOptions) {
  if (isSignedIn) saveToken('tbn_test_token');
  else clearToken();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const router = createMemoryRouter(APP_ROUTES, { initialEntries: [path] });
  const view = render(
    <AppProviders queryClient={queryClient} api={api}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, queryClient };
}
