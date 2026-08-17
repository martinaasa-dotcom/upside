"use client";

import { track } from "@vercel/analytics";
import { useAuth } from "@/components/AuthProvider";
import { ExperienceOnboardingModal } from "@/components/ExperienceOnboardingModal";
import { isAbortError } from "@/lib/abort";
import { isPaperClassOnly } from "@/lib/classroom";
import {
  loadCommunityListCache,
  saveCommunityListCache,
  type CommunityListRow,
} from "@/lib/community-cache";
import {
  EXPERIENCE_TIER_EVENT,
  loadStoredTier,
  saveStoredTier,
  shouldSkipExperienceOnboarding,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import { supabaseIsConfigured } from "@/lib/supabase/env";
import { useEffect, useRef, useState } from "react";

type BookRow = {
  slug?: string | null;
  classroom_community_id?: string | null;
};

/**
 * Same first-run walkthrough on Home, Circle, Fund, and Account.
 * Classroom-only accounts skip. Circle invite joins do not.
 * Show the wizard as soon as they are signed in. Waiting on book/circle
 * fetches used to leave an empty Home, so people hit Add holding first.
 */
export function ExperienceOnboardingGate() {
  const { ready, user } = useAuth();
  const [readyToAsk, setReadyToAsk] = useState(false);
  const [skip, setSkip] = useState(true);
  const inheritedRef = useRef(false);
  const askingRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      if (askingRef.current) return;
      if (loadStoredTier()) setSkip(true);
    };
    window.addEventListener(EXPERIENCE_TIER_EVENT, sync);
    return () => window.removeEventListener(EXPERIENCE_TIER_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!supabaseIsConfigured() || !ready || !user) {
      askingRef.current = false;
      setReadyToAsk(false);
      return;
    }

    const stored = loadStoredTier();
    if (stored) {
      askingRef.current = false;
      setSkip(true);
      setReadyToAsk(true);
    } else {
      askingRef.current = true;
      setSkip(false);
      setReadyToAsk(true);
    }

    const ctrl = new AbortController();

    void (async () => {
      try {
        const [tierRes, bookRes, commRes] = await Promise.all([
          fetch("/api/account/experience-tier", { signal: ctrl.signal }),
          fetch("/api/portfolios", { cache: "no-store", signal: ctrl.signal }),
          fetch("/api/communities", { cache: "no-store", signal: ctrl.signal }),
        ]);
        if (ctrl.signal.aborted) return;

        const tierData = tierRes.ok ? await tierRes.json() : null;
        const bookData = bookRes.ok ? await bookRes.json() : null;
        const commData = commRes.ok ? await commRes.json() : null;

        if (typeof tierData?.tier === "string") {
          askingRef.current = false;
          saveStoredTier(tierData.tier as ExperienceTier);
          setSkip(true);
          return;
        }

        if (stored) {
          askingRef.current = true;
          setSkip(false);
        }

        const portfolios = (bookData?.portfolios ?? []) as BookRow[];
        const holdings = (bookData?.holdings ?? []) as unknown[];
        const communities = (commData?.communities ??
          loadCommunityListCache() ??
          []) as CommunityListRow[];
        if (Array.isArray(commData?.communities)) {
          saveCommunityListCache(communities);
        }

        const paperOnly = isPaperClassOnly(portfolios, communities);
        if (paperOnly) {
          askingRef.current = false;
          setSkip(true);
          return;
        }

        const skipOnboarding = shouldSkipExperienceOnboarding({
          holdingsCount: holdings.length,
          portfolioSlugs: portfolios.map((p) => p.slug),
        });

        if (skipOnboarding && !inheritedRef.current) {
          inheritedRef.current = true;
          askingRef.current = false;
          saveStoredTier("investor");
          void postJsonOrQueue("/api/account/experience-tier", {
            tier: "investor",
          }).catch(() => {
            /* localStorage already has the tier */
          });
          setSkip(true);
          return;
        }

        if (!skipOnboarding) {
          askingRef.current = true;
          setSkip(false);
        }
      } catch (err) {
        if (isAbortError(err) || ctrl.signal.aborted) return;
        const cached = loadCommunityListCache();
        const paperOnly = isPaperClassOnly([], cached ?? []);
        if (paperOnly) {
          askingRef.current = false;
          setSkip(true);
        }
      }
    })();

    return () => ctrl.abort();
  }, [ready, user]);

  if (!readyToAsk || skip || !user) return null;

  return (
    <ExperienceOnboardingModal
      onDone={(tier, knows) => {
        askingRef.current = false;
        setSkip(true);
        track("experience_tier_set", { tier, knowsOptions: knows });
      }}
    />
  );
}
