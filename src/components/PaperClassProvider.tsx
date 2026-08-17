"use client";

import { useAuth } from "@/components/AuthProvider";
import {
  loadPaperClassState,
  paperClassEventName,
  paperClassHomeHref,
  paperClassStateFrom,
  savePaperClassState,
  type PaperClassState,
} from "@/lib/paper-class-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";

const PaperClassContext = createContext<PaperClassState>(loadPaperClassState());

export function usePaperClass(): PaperClassState {
  return useContext(PaperClassContext);
}

export function PaperClassProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useHydratedCache(loadPaperClassState, {
    only: false,
    classIds: [] as string[],
  });

  useEffect(() => {
    const sync = () => setState(loadPaperClassState());
    window.addEventListener(paperClassEventName(), sync);
    return () => window.removeEventListener(paperClassEventName(), sync);
  }, [setState]);

  useEffect(() => {
    if (!user) {
      savePaperClassState({ only: false, classIds: [] });
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      try {
        const [booksRes, listRes] = await Promise.all([
          fetch("/api/portfolios", { cache: "no-store", signal: ctrl.signal }),
          fetch("/api/communities", { cache: "no-store", signal: ctrl.signal }),
        ]);
        const books = await booksRes.json().catch(() => ({}));
        const list = await listRes.json().catch(() => ({}));
        if (ctrl.signal.aborted) return;
        savePaperClassState(
          paperClassStateFrom(
            (books.portfolios ?? []) as {
              classroom_community_id?: string | null;
            }[],
            (list.communities ?? []) as {
              id?: string;
              kind?: string | null;
            }[]
          )
        );
      } catch {
        /* keep cache */
      }
    })();
    return () => ctrl.abort();
  }, [user]);

  useEffect(() => {
    if (!state.only) return;
    if (
      pathname.startsWith("/terms") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/account") ||
      pathname.startsWith("/communities/join") ||
      pathname.startsWith("/auth")
    ) {
      return;
    }
    const home = paperClassHomeHref(state.classIds);
    if (pathname.startsWith("/upside-portfolio")) {
      router.replace(home);
      return;
    }
    if (
      (pathname === "/communities" || pathname === "/communities/") &&
      state.classIds.length === 1
    ) {
      router.replace(home);
    }
  }, [state, pathname, router]);

  return (
    <PaperClassContext.Provider value={state}>
      {children}
    </PaperClassContext.Provider>
  );
}
