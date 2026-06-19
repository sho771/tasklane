import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

function reportRendererError(level, error) {
  const message = error instanceof Error
    ? (error.stack || error.message)
    : String(error ?? '');
  if (window.desktopApi && typeof window.desktopApi.logRenderer === 'function') {
    window.desktopApi.logRenderer(level, message);
  }
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportRendererError('react-error', `${error?.stack || error}\n${info?.componentStack || ''}`);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error-screen">
          <h1>Tasklane の表示に失敗しました</h1>
          <pre>{this.state.error.stack || this.state.error.message || String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  reportRendererError('window-error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  reportRendererError('unhandledrejection', event.reason);
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
