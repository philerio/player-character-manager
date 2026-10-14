import { Component, type ReactNode } from "react";
import { downloadWorkingCopy } from "../app/storage";
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="auth-page">
          <section className="auth-card" role="alert">
            <h1>Could not display this screen</h1>
            <p>
              Your saved working copy has not been intentionally discarded.
              Download it before reloading if you have pending changes.
            </p>
            <button className="secondary-action" onClick={downloadWorkingCopy}>
              Download working copy
            </button>
            <button
              className="primary-button"
              onClick={() => this.setState({ failed: false })}
            >
              Try displaying the app again
            </button>
          </section>
        </main>
      );
    return this.props.children;
  }
}
