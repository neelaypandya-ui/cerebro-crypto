import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global safety net: catch canvas errors before React processes them
window.addEventListener('error', (event) => {
  if (event.error && String(event.error).includes('error state')) {
    event.preventDefault();
    console.warn('[Global] Canvas error suppressed:', event.error);
    return true;
  }
  if (event.message && (event.message.includes('error state') || event.message.includes('InvalidStateError'))) {
    event.preventDefault();
    console.warn('[Global] Canvas error suppressed:', event.message);
    return true;
  }
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0 };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);
    // Auto-recover after 1 second (up to 3 retries)
    if (this.state.retryCount < 3) {
      setTimeout(() => {
        this.setState((s) => ({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: s.retryCount + 1,
        }));
      }, 1000);
    }
  }
  render() {
    if (this.state.hasError) {
      if (this.state.retryCount < 3) {
        // Show brief loading state while auto-recovering
        return React.createElement('div', {
          style: { padding: 40, color: '#6c63ff', background: '#0a0a0f', fontFamily: 'monospace' }
        }, 'Recovering...');
      }
      return React.createElement('div', {
        style: { padding: 40, color: '#ff4560', background: '#0a0a0f', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }
      },
        React.createElement('h2', null, 'Cerebro Crypto - Render Error'),
        React.createElement('p', { style: { color: '#e2e2e2' } }, String(this.state.error)),
        React.createElement('button', {
          style: { marginTop: 16, padding: '8px 16px', background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' },
          onClick: () => this.setState({ hasError: false, error: null, errorInfo: null, retryCount: 0 }),
        }, 'Retry'),
        React.createElement('pre', { style: { fontSize: 11, color: '#8888aa', marginTop: 16 } },
          this.state.errorInfo?.componentStack || ''
        )
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
