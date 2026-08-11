"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { Dashboard } from "@/components/Dashboard";
import { SignInGate } from "@/components/SignInGate";
import { ToastProvider } from "@/components/ui/Toast";
import { useMemo } from "react";

export default function Home() {
  const bypass = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return Boolean(sp.get("share")?.trim()) || sp.get("view") === "guest";
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <SignInGate bypass={bypass}>
          <Dashboard />
        </SignInGate>
      </ToastProvider>
    </AuthProvider>
  );
}
