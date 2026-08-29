import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './shared/styles/tokens.css';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import { initErrorReporting } from './shared/lib/errorReporting';

initErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
