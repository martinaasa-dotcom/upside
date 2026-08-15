"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

type Props = {
  /** Short name shown in the fallback, e.g. "Pulse". */
  name: string;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * Isolates a dashboard module so a throw in one widget cannot white-screen
 * the rest of the book. Retry remounts the child.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}]`, error, info.componentStack);
    void fetch("/api/internal/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${this.props.name}: ${error.message}`,
        stack: error.stack,
        path: typeof window !== "undefined" ? window.location.pathname : "",
      }),
    }).catch(() => {
      /* reporting is best-effort */
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-brand/20 bg-card/80 px-5 py-6"
        >
          <p className="text-sm font-semibold text-white">
            {this.props.name} hit a snag
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            Your book is fine. This panel failed to render.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="btn-primary mt-4 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
