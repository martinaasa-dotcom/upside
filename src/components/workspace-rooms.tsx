"use client";

import { Dashboard } from "@/components/Dashboard";
import { SignInGate } from "@/components/SignInGate";
import { UpsidePortfolioPage } from "@/components/UpsidePortfolioPage";
import { ToastProvider } from "@/components/ui/Toast";

export function BookRoom() {
  return (
    <ToastProvider>
      <SignInGate>
        <Dashboard />
      </SignInGate>
    </ToastProvider>
  );
}

export function FundRoom() {
  return (
    <SignInGate>
      <UpsidePortfolioPage />
    </SignInGate>
  );
}
