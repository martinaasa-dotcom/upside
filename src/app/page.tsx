"use client";

import { Dashboard } from "@/components/Dashboard";
import { SignInGate } from "@/components/SignInGate";
import { ToastProvider } from "@/components/ui/Toast";

export default function Home() {
  return (
    <ToastProvider>
      <SignInGate>
        <Dashboard />
      </SignInGate>
    </ToastProvider>
  );
}
