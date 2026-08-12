"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { UpsidePortfolioPage } from "@/components/UpsidePortfolioPage";
import { SignInGate } from "@/components/SignInGate";

export default function UpsidePortfolioRoute() {
  return (
    <AuthProvider>
      <SignInGate>
        <UpsidePortfolioPage />
      </SignInGate>
    </AuthProvider>
  );
}
