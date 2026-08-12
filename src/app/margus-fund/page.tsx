"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { MargusFundPage } from "@/components/MargusFundPage";
import { SignInGate } from "@/components/SignInGate";

export default function MargusFundRoute() {
  return (
    <AuthProvider>
      <SignInGate>
        <MargusFundPage />
      </SignInGate>
    </AuthProvider>
  );
}
