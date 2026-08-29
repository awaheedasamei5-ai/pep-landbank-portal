import { Component, type ErrorInfo, type ReactNode } from 'react';
import { report } from '../lib/errorReporting';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Catches render-time crashes anywhere in the tree below it and shows a
// real recovery screen instead of the blank white page a crash would
// otherwise leave behind (React unmounts the whole tree on an uncaught
// render error with no boundary). Every catch goes through report() -- see
// shared/lib/errorReporting.ts -- so a production crash is never silent.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    report(error, { componentStack: info.componentStack, route: window.location.pathname });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--user-font-family)' }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>The error has been logged. Try reloading the page.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 100, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
