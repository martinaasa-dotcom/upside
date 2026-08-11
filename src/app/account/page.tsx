"use client";

import { AccountPage } from "@/components/AccountPage";
import { AuthProvider } from "@/components/AuthProvider";

export default function AccountRoute() {
  return (
    <AuthProvider>
      <AccountPage />
    </AuthProvider>
  );
}
