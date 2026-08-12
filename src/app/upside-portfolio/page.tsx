"use client";

import { UpsidePortfolioPage } from "@/components/UpsidePortfolioPage";
import { SignInGate } from "@/components/SignInGate";

export default function UpsidePortfolioRoute() {
  return (
    <SignInGate>
      <UpsidePortfolioPage />
    </SignInGate>
  );
}
