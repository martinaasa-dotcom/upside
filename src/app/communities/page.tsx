"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { CommunitiesList } from "@/components/CommunitiesList";

export default function CommunitiesPage() {
  return (
    <AuthProvider>
      <CommunitiesList />
    </AuthProvider>
  );
}
