"use client";

import { AdminPage } from "@/components/AdminPage";
import { AuthProvider } from "@/components/AuthProvider";

export default function AdminRoute() {
  return (
    <AuthProvider>
      <AdminPage />
    </AuthProvider>
  );
}
