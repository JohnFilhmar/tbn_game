import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { APP_ROUTES } from '@/app/routes';
import { AppProviders } from '@/providers/AppProviders';
import './index.css';

const router = createBrowserRouter(APP_ROUTES, { basename: '/app' });
const root = document.getElementById('root');

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}
