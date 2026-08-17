"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { reportClientError } from "@/lib/telemetry-client";

type Props = {
  /** Short name shown in the fallback, e.g. "Pulse". */
  name: string;
  children: ReactNode;
  /** Clear a stale fallback when the user moves to another sheet or room. */
  resetKey?: string | number;
  className?: string;
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

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError({
      message: `${this.props.name}: ${error.message}`,
      stack: error.stack,
      widget: this.props.name,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className={
            this.props.className ??
            "min-w-0 overflow-x-clip rounded-2xl border border-border bg-card px-panel py-6"
          }
        >
          <p className="text-sm font-semibold text-foreground">
            {this.props.name} hit a snag
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
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
