"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { clearBookCache } from "@/lib/book-cache";

export type AuthProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

type AuthState = {
  ready: boolean;
  user: User | null;
  profile: AuthProfile | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setProfile({
          id: u.id,
          email: u.email ?? null,
          display_name: u.user_metadata?.full_name ?? null,
          avatar_url: u.user_metadata?.avatar_url ?? null,
        });
        return;
      }
      const data = await res.json();
      setProfile(data.profile ?? null);
    } catch {
      setProfile({
        id: u.id,
        email: u.email ?? null,
        display_name: null,
        avatar_url: null,
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setUser(null);
      setProfile(null);
      setReady(true);
      return;
    }
    // Cleared in `finally` so a fast auth check doesn't leave an 8s timer
    // (and its rejected promise) dangling behind every single page load.
    let timeoutId: number | undefined;
    try {
      // Session check only — don't block the sign-in gate on profile/claims.
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error("auth timeout")),
            8000
          );
        }),
      ]);
      setUser(result.data.user ?? null);
      setReady(true);
      void loadProfile(result.data.user ?? null);
    } catch {
      setUser(null);
      setProfile(null);
      setReady(true);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  }, [loadProfile]);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setReady(true);
      return;
    }
    void refresh();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      setReady(true);
      void loadProfile(next);
    });
    return () => subscription.unsubscribe();
  }, [loadProfile, refresh]);

  const signInWithGoogle = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    if (!supabase) throw new Error("Supabase is not configured");
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    clearBookCache();
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      profile,
      signInWithGoogle,
      signOut,
      refresh,
    }),
    [ready, user, profile, signInWithGoogle, signOut, refresh]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
