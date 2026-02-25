
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

/**
 * Error Boundary — catches any synchronous render errors in the component
 * tree and shows a recovery UI instead of a blank white page.
 *
 * Without this, a render error in any component silently unmounts the entire
 * React tree, leaving the user with a blank page and no indication of what
 * went wrong.
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Render error caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: '2rem',
        }}>
          <div style={{
            background: '#fff',
            border: '1px solid #fecaca',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ color: '#dc2626', fontWeight: 700, marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <details style={{ marginBottom: '1.5rem' }}>
              <summary style={{ color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>
                Technical details
              </summary>
              <pre style={{
                marginTop: '0.5rem',
                fontSize: '0.7rem',
                color: '#64748b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: '#f8fafc',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                maxHeight: '200px',
                overflow: 'auto',
              }}>
                {this.state.error?.stack}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#4c2de0',
                color: '#fff',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '0.625rem 1.25rem',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
