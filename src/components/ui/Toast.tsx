"use client";

import { toast } from "sonner";

export type ToastKind = "success" | "error" | "info";

type ToastContextValue = {
  push: (message: string, kind?: ToastKind) => void;
};

function pushToast(message: string, kind: ToastKind = "info") {
  if (kind === "success") toast.success(message);
  else if (kind === "error") toast.error(message);
  else toast(message);
}

export function useToast(): ToastContextValue {
  return { push: pushToast };
}

/** Toaster lives in Providers. This stays so existing rooms keep compiling. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return children;
}
