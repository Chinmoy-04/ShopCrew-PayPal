import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ShopCrew UI crash", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="page">
          <h1>Something broke on this page</h1>
          <div className="error">{this.state.error.message}</div>
          <p className="note">Open DevTools → Console for the stack. Hard-refresh (Ctrl+Shift+R) after a fix.</p>
          <button className="btn primary" type="button" onClick={() => this.setState({ error: null })}>Try again</button>
        </main>
      );
    }
    return this.props.children;
  }
}
