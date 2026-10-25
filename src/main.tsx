import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { WorkspaceProvider } from './state/WorkspaceContext';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceProvider>
      <RouterProvider router={router} />
    </WorkspaceProvider>
  </StrictMode>,
);
