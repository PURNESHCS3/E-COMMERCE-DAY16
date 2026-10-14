import { Component, type ErrorInfo, type ReactNode } from "react";

interface AIChatErrorBoundaryProps {
  children: ReactNode;
}

interface AIChatErrorBoundaryState {
  hasError: boolean;
}

export default class AIChatErrorBoundary extends Component<
  AIChatErrorBoundaryProps,
  AIChatErrorBoundaryState
> {
  state: AIChatErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AIChatErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The AI assistant UI failed to render.", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-50 max-w-xs rounded-xl border bg-white p-4 text-sm text-slate-800 shadow-lg"
        >
          <p>The AI assistant is temporarily unavailable.</p>
          <button
            type="button"
            className="mt-2 font-medium underline"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
