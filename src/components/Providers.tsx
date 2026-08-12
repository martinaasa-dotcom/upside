"use client";

import { AuthProvider } from "@/components/AuthProvider";
import type { ReactNode } from "react";

/**
 * Root-level providers, mounted ONCE in the root layout instead of per-page.
 * AuthProvider used to be wrapped separately inside every page.tsx (/,
 * /account, /admin, /upside-portfolio, /communities, /communities/[id],
 * /communities/join, /account/join) -- since each is its own top-level App
 * Router segment, navigating between them (even client-side via next/link)
 * remounted AuthProvider from scratch every time, re-running a fresh
 * supabase.auth.getUser() round-trip + /api/auth/me profile fetch on every
 * single page change across the whole app. Mounted here above {children}
 * instead, it survives navigation and only ever runs that check once per
 * visit.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
