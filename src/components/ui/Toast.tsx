"use client";

import { cn } from "@/lib/format";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  push: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Set<number>>(new Set());

  useEffect(() => {
    const ids = timers.current;
    return () => {
      for (const id of ids) window.clearTimeout(id);
      ids.clear();
    };
  }, []);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev, { id, kind, message }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
    timers.current.add(timer);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-[max(1.25rem,calc(var(--dock-pad,1.25rem)+0.75rem))] right-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-xl backdrop-blur",
              t.kind === "success" &&
                "border-brand/30 bg-brand-dark/90 text-brand-bright",
              t.kind === "error" &&
                "border-rose-500/30 bg-rose-950/90 text-rose-100",
              t.kind === "info" &&
                "border-zinc-600 bg-zinc-950/95 text-zinc-100"
            )}
            role="status"
          >
            <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              // Hit area grown via a pseudo-element rather than padding: a
              // real 44px box would stretch this compact toast taller on
              // mobile, and the row is items-start so it'd sit oddly too.
              className="relative shrink-0 rounded p-1 opacity-70 after:absolute after:-inset-2.5 after:content-[''] hover:opacity-100"
              onClick={() =>
                setItems((prev) => prev.filter((x) => x.id !== t.id))
              }
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
