"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { Dashboard } from "@/components/Dashboard";
import { SignInGate } from "@/components/SignInGate";
import { ToastProvider } from "@/components/ui/Toast";

export default function Home() {
  return (
    <AuthProvider>
      <ToastProvider>
        <SignInGate>
          <Dashboard />
        </SignInGate>
      </ToastProvider>
    </AuthProvider>
  );
}
