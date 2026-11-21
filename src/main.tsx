import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {AppErrorBoundary} from './components/AppErrorBoundary.tsx';
import {installPreloadErrorRecovery} from './lib/pwaRecovery.ts';

installPreloadErrorRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
