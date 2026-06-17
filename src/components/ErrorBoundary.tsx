/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_AUTO_RETRIES = 3;

/**
 * Error Boundary that auto-retries on DOM reconciliation errors (insertBefore)
 * and preserves session state so reloads don't go back to the start.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] React crash captured:', error.message);

    // Auto-retry on DOM reconciliation errors (insertBefore, removeChild, etc.)
    const isDomError = error.message?.includes('insertBefore') 
      || error.message?.includes('removeChild')
      || error.message?.includes('appendChild')
      || error.name === 'NotFoundError';

    if (isDomError && this.state.retryCount < MAX_AUTO_RETRIES) {
      console.log(`[ErrorBoundary] Auto-retrying (${this.state.retryCount + 1}/${MAX_AUTO_RETRIES})...`);
      setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1
        }));
      }, 500);
    }
  }

  handleReload = () => {
    // Preserve session - DO NOT clear gameplay or session data
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '420px',
            width: '100%',
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '32px 24px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            textAlign: 'center',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '24px'
            }}>
              ⚠️
            </div>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 800,
              color: '#1e293b',
              margin: '0 0 8px'
            }}>
              Ops! Algo deu errado
            </h2>
            <p style={{
              fontSize: '13px',
              color: '#64748b',
              margin: '0 0 20px',
              lineHeight: 1.5
            }}>
              Um erro inesperado ocorreu. Clique abaixo para continuar de onde parou.
            </p>

            <details style={{
              marginBottom: '20px',
              textAlign: 'left',
              backgroundColor: '#f1f5f9',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '11px',
              color: '#475569',
              border: '1px solid #e2e8f0'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                Detalhes do erro (para suporte)
              </summary>
              <pre style={{
                marginTop: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#dc2626'
              }}>
                {this.state.error?.message}
                {'\n\n'}
                {this.state.error?.stack}
              </pre>
            </details>

            <button
              onClick={this.handleReload}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
