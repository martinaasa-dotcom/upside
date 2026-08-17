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
 * Same first-run questions on Home, Circle, Fund, and Account.
 * Classroom-only accounts skip. Circle invite joins do not.
 */
export function ExperienceOnboardingGate() {
  const { ready, user } = useAuth();
  const [experienceTier, setExperienceTier] = useState<ExperienceTier | null>(
    null
  );
  const [readyToAsk, setReadyToAsk] = useState(false);
  const [skip, setSkip] = useState(true);
  const inheritedRef = useRef(false);

  useEffect(() => {
    const sync = () => setExperienceTier(loadStoredTier());
    sync();
    window.addEventListener(EXPERIENCE_TIER_EVENT, sync);
    return () => window.removeEventListener(EXPERIENCE_TIER_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!supabaseIsConfigured() || !ready || !user) {
      setReadyToAsk(false);
      return;
    }
    const stored = loadStoredTier();
    if (stored) {
      setExperienceTier(stored);
      setSkip(true);
      setReadyToAsk(true);
      return;
    }

    const ctrl = new AbortController();
    setReadyToAsk(false);

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
          setExperienceTier(tierData.tier as ExperienceTier);
          saveStoredTier(tierData.tier as ExperienceTier);
          setSkip(true);
          setReadyToAsk(true);
          return;
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
          setSkip(true);
          setReadyToAsk(true);
          return;
        }

        const skipOnboarding = shouldSkipExperienceOnboarding({
          holdingsCount: holdings.length,
          portfolioSlugs: portfolios.map((p) => p.slug),
        });

        if (skipOnboarding && !inheritedRef.current) {
          inheritedRef.current = true;
          setExperienceTier("investor");
          saveStoredTier("investor");
          void postJsonOrQueue("/api/account/experience-tier", {
            tier: "investor",
          }).catch(() => {
            /* localStorage already has the tier */
          });
          setSkip(true);
          setReadyToAsk(true);
          return;
        }

        setSkip(skipOnboarding);
        setReadyToAsk(true);
      } catch (err) {
        if (isAbortError(err) || ctrl.signal.aborted) return;
        const cached = loadCommunityListCache();
        setSkip(isPaperClassOnly([], cached ?? []));
        setReadyToAsk(true);
      }
    })();

    return () => ctrl.abort();
  }, [ready, user]);

  if (!readyToAsk || skip || experienceTier || !user) return null;

  return (
    <ExperienceOnboardingModal
      onDone={(tier, knows) => {
        setExperienceTier(tier);
        setSkip(true);
        track("experience_tier_set", { tier, knowsOptions: knows });
      }}
    />
  );
}
