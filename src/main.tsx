import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Global error handlers to prevent white screen on mobile
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', message, source, lineno, colno, error);
};
window.onunhandledrejection = (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  // Prevent the browser from crashing on unhandled async errors
  event.preventDefault();
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
