"use client";

import { SignInGate } from "@/components/SignInGate";
import { track } from "@vercel/analytics";
import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { currency, percent, signedCurrency, cn } from "@/lib/format";
import { buildOverview } from "@/lib/overview";
import {
  loadCommunityCache,
  saveCommunityCache,
} from "@/lib/community-cache";
import {
  buildPortfolioPersonality,
  type PortfolioPersonality,
} from "@/lib/portfolio-personality";
import { buildCommunityFunFacts } from "@/lib/community-fun-facts";
import { COMPOUND_MILESTONE_GOALS } from "@/lib/compound-play";
import { todayKeyInTz } from "@/lib/timezone";
import type { Holding, Portfolio, Quote } from "@/lib/types";
import {
  ArrowLeft,
  Check,
  Copy,
  Gauge,
  LayoutGrid,
  Lightbulb,
  Link2,
  Medal,
  Shield,
  Shuffle,
  Sparkles,
  Target,
  Trophy,
  UserMinus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

type Member = {
  user_id: string;
  user_ids?: string[];
  emails?: string[];
  role: string;
  joined_at: string;
  profile: Profile | null;
  is_you?: boolean;
};

type PendingMember = {
  key: string;
  label: string;
  portfolio_ids: string[];
  emails: string[];
};

type CommunityMeta = {
  id: string;
  name: string;
  created_by: string | null;
};

type OwnedPortfolio = Portfolio & { owner_id?: string };

type Props = {
  communityId: string;
};

/** Shape of the two API responses this view combines — matches what
 * /api/communities/[id] and /api/communities/[id]/book return. */
type CommunityMetaResponse = {
  community: CommunityMeta;
  members?: Member[];
  pending_members?: PendingMember[];
  isAdmin?: boolean;
};
type CommunityBookResponse = {
  portfolios?: OwnedPortfolio[];
  holdings?: Holding[];
  profiles?: Profile[];
  ownership?: { portfolio_id: string; user_id: string }[];
};

/** Synchronous cache read shared by every piece of state below, so they
 * all hydrate from the exact same snapshot instead of some fields lagging
 * a render behind others. */
function readCommunityCache(communityId: string): {
  meta: CommunityMetaResponse | null;
  book: CommunityBookResponse | null;
} {
  const cached = loadCommunityCache(communityId);
  if (!cached) return { meta: null, book: null };
  return {
    meta: (cached.meta as CommunityMetaResponse) ?? null,
    book: (cached.book as CommunityBookResponse) ?? null,
  };
}

export function CommunityView({ communityId }: Props) {
  const initialCacheRef = useRef(readCommunityCache(communityId));
  const [community, setCommunity] = useState<CommunityMeta | null>(
    () => initialCacheRef.current.meta?.community ?? null
  );
  const [members, setMembers] = useState<Member[]>(
    () => initialCacheRef.current.meta?.members ?? []
  );
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>(
    () => initialCacheRef.current.meta?.pending_members ?? []
  );
  const [isAdmin, setIsAdmin] = useState(
    () => initialCacheRef.current.meta?.isAdmin ?? false
  );
  const [portfolios, setPortfolios] = useState<OwnedPortfolio[]>(
    () => initialCacheRef.current.book?.portfolios ?? []
  );
  const [holdings, setHoldings] = useState<Holding[]>(
    () => initialCacheRef.current.book?.holdings ?? []
  );
  const [profiles, setProfiles] = useState<Profile[]>(
    () => initialCacheRef.current.book?.profiles ?? []
  );
  const [ownership, setOwnership] = useState<
    { portfolio_id: string; user_id: string }[]
  >(() => initialCacheRef.current.book?.ownership ?? []);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  // Only true when we have nothing at all to show yet — a cache hit
  // (even a stale one) renders immediately while load() quietly confirms
  // it's current in the background, instead of blanking the page on
  // every single visit the way an unconditional loading flag would.
  const [loading, setLoading] = useState(() => !initialCacheRef.current.meta);
  const [error, setError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("member")
  );
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<
    string | null
  >(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("portfolio")
  );
  const [view, setView] = useState<"overview" | "members">(() =>
    typeof window === "undefined"
      ? "overview"
      : new URLSearchParams(window.location.search).get("view") === "members"
        ? "members"
        : "overview"
  );
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  // Tracks whether we have SOME data already (from cache or a prior
  // successful load) — a ref so `load` doesn't need `community` etc. in
  // its own dependency array just to decide whether to show a spinner.
  const hasDataRef = useRef(Boolean(initialCacheRef.current.meta));

  const load = useCallback(async () => {
    const isBackgroundRefresh = hasDataRef.current;
    if (!isBackgroundRefresh) setLoading(true);
    if (!isBackgroundRefresh) setError(null);
    try {
      const [metaRes, bookRes] = await Promise.all([
        fetch(`/api/communities/${communityId}`, { cache: "no-store" }),
        fetch(`/api/communities/${communityId}/book`, { cache: "no-store" }),
      ]);
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? `Failed (${metaRes.status})`
        );
      }
      if (!bookRes.ok) {
        const err = await bookRes.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? `Book failed (${bookRes.status})`
        );
      }
      const meta = await metaRes.json();
      const book = await bookRes.json();
      setCommunity(meta.community);
      setMembers(meta.members ?? []);
      setPendingMembers(meta.pending_members ?? []);
      setIsAdmin(Boolean(meta.isAdmin));
      setPortfolios(book.portfolios ?? []);
      setHoldings(book.holdings ?? []);
      setProfiles(book.profiles ?? []);
      setOwnership(book.ownership ?? []);
      hasDataRef.current = true;
      saveCommunityCache(communityId, { meta, book });
    } catch (e) {
      // A background refresh failing behind already-visible cached
      // content shouldn't slap an error over it — only surface the error
      // when there was nothing on screen to begin with.
      if (!isBackgroundRefresh) {
        setError(e instanceof Error ? e.message : "Failed to load community");
      }
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ownership/membership can change server-side (e.g. someone else's first
  // sign-in claims a pending sheet) while this tab sits in the background —
  // refetch on return so "awaiting sign-in" / portfolio counts don't go stale.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Drill-down (member -> their portfolio) mirrors into ?member=&portfolio=
  // so a hard refresh lands back on the exact view, and Back/Forward step
  // through the hierarchy naturally (member list -> member -> portfolio)
  // instead of leaving the page entirely on the first Back press.
  const fromPopRef = useRef(false);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    function onPopState() {
      fromPopRef.current = true;
      const params = new URLSearchParams(window.location.search);
      setSelectedOwnerId(params.get("member"));
      setSelectedPortfolioId(params.get("portfolio"));
      setView(params.get("view") === "members" ? "members" : "overview");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedOwnerId) url.searchParams.set("member", selectedOwnerId);
    else url.searchParams.delete("member");
    if (selectedPortfolioId) url.searchParams.set("portfolio", selectedPortfolioId);
    else url.searchParams.delete("portfolio");
    if (view === "members") url.searchParams.set("view", "members");
    else url.searchParams.delete("view");
    const href = `${url.pathname}${url.search}`;

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      window.history.replaceState(null, "", href);
      return;
    }
    if (fromPopRef.current) {
      fromPopRef.current = false;
      window.history.replaceState(null, "", href);
      return;
    }
    window.history.pushState(null, "", href);
  }, [selectedOwnerId, selectedPortfolioId, view]);

  // A ?member=/?portfolio= link can go stale (member left, sheet deleted) or
  // just be wrong — once real data is in, drop selections that don't
  // resolve to anything instead of leaving the drill-down view blank.
  useEffect(() => {
    if (loading || !selectedOwnerId) return;
    const valid =
      members.some(
        (m) =>
          m.user_id === selectedOwnerId ||
          m.user_ids?.includes(selectedOwnerId)
      ) || pendingMembers.some((p) => `pending:${p.key}` === selectedOwnerId);
    if (!valid) {
      setSelectedOwnerId(null);
      setSelectedPortfolioId(null);
    }
  }, [loading, selectedOwnerId, members, pendingMembers]);

  useEffect(() => {
    if (loading || !selectedPortfolioId) return;
    if (!portfolios.some((p) => p.id === selectedPortfolioId)) {
      setSelectedPortfolioId(null);
    }
  }, [loading, selectedPortfolioId, portfolios]);

  useEffect(() => {
    const tickers = [
      ...new Set(holdings.map((h) => h.ticker).filter(Boolean)),
    ];
    if (!tickers.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(tickers.join(","))}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setQuotes((data.quotes ?? {}) as Record<string, Quote>);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [holdings]);

  const profileName = useCallback(
    (id: string) => {
      if (id.startsWith("pending:")) {
        const key = id.slice("pending:".length);
        return (
          pendingMembers.find((p) => p.key === key)?.label ??
          key.charAt(0).toUpperCase() + key.slice(1)
        );
      }
      const p =
        profiles.find((x) => x.id === id) ??
        members.find((m) => m.user_id === id)?.profile;
      return p?.display_name || p?.email || "Member";
    },
    [profiles, members, pendingMembers]
  );

  const memberEmails = useCallback(
    (m: Member) => {
      const emails =
        m.emails?.length
          ? m.emails
          : m.profile?.email
            ? [m.profile.email]
            : [];
      return emails;
    },
    []
  );

  const overview = useMemo(
    () => buildOverview(portfolios, holdings, quotes),
    [portfolios, holdings, quotes]
  );

  // One combined per-person stat, computed once and reused by the power
  // animals grid, leaderboard, risk comparison, and fun facts — instead of
  // each section re-deriving its own copy of "which sheets does this
  // person own".
  type MemberStat = {
    id: string;
    name: string;
    isYou: boolean;
    isPending: boolean;
    sheetCount: number;
    totalValue: number;
    todayDollar: number;
    todayPct: number | null;
    roiPct: number;
    personality: PortfolioPersonality | null;
  };
  const memberStats = useMemo<MemberStat[]>(() => {
    const statFor = (
      id: string,
      name: string,
      sheetIds: Set<string>,
      isYou: boolean,
      isPending: boolean
    ): MemberStat => {
      const sheets = portfolios.filter((p) => sheetIds.has(p.id));
      const scores = sheets
        .map((p) => overview.sheets.find((s) => s.portfolio.id === p.id))
        .filter((s): s is (typeof overview.sheets)[number] => Boolean(s));
      const totalValue = scores.reduce((s, sc) => s + sc.totalValue, 0);
      const todayDollar = scores.reduce((s, sc) => s + sc.todayDollar, 0);
      const buyValue = scores.reduce((s, sc) => s + sc.buyValue, 0);
      const roiDollar = scores.reduce((s, sc) => s + sc.roiDollar, 0);
      const roiPct = buyValue > 0 ? roiDollar / buyValue : 0;
      const previousTotal = totalValue - todayDollar;
      const todayPct = previousTotal > 0 ? todayDollar / previousTotal : null;
      const tickerValues = holdings
        .filter((h) => sheetIds.has(h.portfolio_id))
        .map((h) => ({
          ticker: h.ticker,
          value: h.shares * (quotes[h.ticker]?.price ?? h.buy_price),
        }));
      const personality =
        tickerValues.length > 0 ? buildPortfolioPersonality(tickerValues) : null;
      return {
        id,
        name,
        isYou,
        isPending,
        sheetCount: sheets.length,
        totalValue,
        todayDollar,
        todayPct,
        roiPct,
        personality,
      };
    };

    const list: MemberStat[] = members.map((m) => {
      const sheetIds = new Set(
        ownership.filter((o) => o.user_id === m.user_id).map((o) => o.portfolio_id)
      );
      return statFor(
        m.user_id,
        profileName(m.user_id),
        sheetIds,
        Boolean(m.is_you),
        false
      );
    });
    for (const p of pendingMembers) {
      const sheetIds = new Set(p.portfolio_ids);
      list.push(statFor(`pending:${p.key}`, p.label, sheetIds, false, true));
    }
    return list;
  }, [members, pendingMembers, ownership, portfolios, overview, holdings, quotes, profileName]);

  const membersWithBooks = useMemo(
    () => memberStats.filter((m) => m.sheetCount > 0),
    [memberStats]
  );

  const communityMilestones = useMemo(() => {
    const total = overview.totals.totalValue;
    const hitCount = COMPOUND_MILESTONE_GOALS.filter((g) => total >= g).length;
    const next = COMPOUND_MILESTONE_GOALS.find((g) => total < g) ?? null;
    const lastGoal =
      [...COMPOUND_MILESTONE_GOALS].reverse().find((g) => total >= g) ?? 0;
    // Progress WITHIN the current bracket (lastGoal -> next), so the bar
    // fill actually lines up with the lastGoal/next labels shown below it
    // instead of always reading against zero.
    const bracketSize = next != null ? next - lastGoal : 1;
    const progress =
      next != null && bracketSize > 0
        ? Math.min(1, (total - lastGoal) / bracketSize)
        : 1;
    return {
      total,
      hitCount,
      goalCount: COMPOUND_MILESTONE_GOALS.length,
      next,
      remaining: next != null ? next - total : 0,
      progress,
      lastGoal,
    };
  }, [overview.totals.totalValue]);

  const [funFactsShuffle, setFunFactsShuffle] = useState(0);
  const communityFunFacts = useMemo(
    () =>
      buildCommunityFunFacts(
        membersWithBooks,
        funFactsShuffle === 0 ? todayKeyInTz() : `shuffle-${funFactsShuffle}`,
        6
      ),
    [membersWithBooks, funFactsShuffle]
  );

  const selectedPortfolio = selectedPortfolioId
    ? portfolios.find((p) => p.id === selectedPortfolioId)
    : null;

  const selectedHoldings = selectedPortfolioId
    ? holdings.filter((h) => h.portfolio_id === selectedPortfolioId)
    : [];

  async function createInvite() {
    setBusy(true);
    setInviteUrl(null);
    try {
      const res = await fetch(`/api/communities/${communityId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim() || undefined,
          daysValid: 14,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      track("community_invite_created");
      const url = `${window.location.origin}${data.path}`;
      setInviteUrl(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Remove failed");
      }
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setRole(userId: string, role: "admin" | "member") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Role update failed"
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Role update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SignInGate>
      <div className="min-h-dvh bg-[#121214] text-zinc-100">
        <header className="sticky top-0 z-40 border-b border-brand-deep/25 bg-[#121214]/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <HeaderBrand />
            <WorkspaceSwitcher className="hidden sm:inline-flex" />
            <div className="mx-auto flex min-w-0 items-center gap-2 sm:mx-0 sm:ml-auto">
              <Users className="hidden h-4 w-4 shrink-0 text-brand-bright/80 sm:block" />
              <span className="truncate text-sm font-medium">
                {community?.name ?? "Community"}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
          {loading && (
            <p className="text-sm text-zinc-500">Loading community…</p>
          )}
          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {!loading && !selectedOwnerId && (
            <>
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Community overview · live read-only
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat
                    label="Total value"
                    value={currency(overview.totals.totalValue)}
                  />
                  <Stat
                    label="Today"
                    value={signedCurrency(overview.totals.todayDollar)}
                    sub={
                      overview.totals.todayPct != null
                        ? percent(overview.totals.todayPct)
                        : undefined
                    }
                    tone={overview.totals.todayDollar >= 0 ? "up" : "down"}
                  />
                  <Stat
                    label="Unrealized P&L"
                    value={signedCurrency(overview.totals.roiDollar)}
                    sub={percent(overview.totals.roiPct)}
                    tone={overview.totals.roiDollar >= 0 ? "up" : "down"}
                  />
                </div>
              </section>

              <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 w-fit">
                {(
                  [
                    ["overview", "Overview", LayoutGrid],
                    ["members", "Members", Users],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                      view === id
                        ? "bg-brand/20 text-brand-bright"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {view === "overview" && (
                <>
                  <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-7">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
                          <Target className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Family milestone tracker
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            {communityMilestones.hitCount} of{" "}
                            {communityMilestones.goalCount} cleared, combined
                          </p>
                        </div>
                      </div>
                      {communityMilestones.next != null && (
                        <p className="text-sm text-zinc-300">
                          Next: <span className="font-semibold text-white">
                            {currency(communityMilestones.next, 0)}
                          </span>
                          <span className="text-zinc-500">
                            {" "}
                            · {currency(communityMilestones.remaining, 0)} to go
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-bright transition-all"
                        style={{
                          width: `${Math.round(communityMilestones.progress * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-zinc-500">
                      <span>{currency(communityMilestones.lastGoal, 0)}</span>
                      <span className="tabular-nums text-brand-bright">
                        {currency(communityMilestones.total, 0)}
                      </span>
                      <span>
                        {communityMilestones.next != null
                          ? currency(communityMilestones.next, 0)
                          : "🎉 all cleared"}
                      </span>
                    </div>
                  </section>

                  {membersWithBooks.length > 0 && (
                    <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-7">
                      <div className="mb-5 flex items-center gap-2.5">
                        <div className="rounded-xl bg-violet-500/15 p-2 text-violet-300">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Power animals
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            Diversification + risk, turned into a spirit animal
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {membersWithBooks.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedOwnerId(m.id);
                              setSelectedPortfolioId(null);
                            }}
                            className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-left transition hover:border-brand/40"
                          >
                            <span className="text-3xl" aria-hidden>
                              {m.personality?.animalEmoji ?? "❔"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">
                                {m.name}
                                {m.isYou && (
                                  <span className="ml-1.5 text-xs font-normal text-zinc-500">
                                    (you)
                                  </span>
                                )}
                                {m.isPending && (
                                  <span className="ml-1.5 text-xs font-normal text-amber-500/90">
                                    awaiting sign-in
                                  </span>
                                )}
                              </p>
                              <p className="text-xs font-medium text-brand-bright">
                                {m.personality?.animal ?? "No book yet"}
                              </p>
                              {m.personality && (
                                <div className="mt-2 space-y-1">
                                  <MiniBar
                                    label="Diversified"
                                    value={m.personality.diversificationScore}
                                    color="#38bdf8"
                                  />
                                  <MiniBar
                                    label="Risk"
                                    value={m.personality.riskScore}
                                    color="#f472b6"
                                  />
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {membersWithBooks.length > 0 && (
                    <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-7">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="rounded-xl bg-amber-500/15 p-2 text-amber-300">
                          <Trophy className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Today&apos;s leaderboard
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            Ranked by today&apos;s move
                          </p>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {[...membersWithBooks]
                          .sort((a, b) => (b.todayPct ?? -1) - (a.todayPct ?? -1))
                          .map((m, i) => (
                            <li
                              key={m.id}
                              className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3.5 py-2.5"
                            >
                              <span className="w-6 shrink-0 text-center">
                                {i === 0 ? (
                                  <Medal className="mx-auto h-4 w-4 text-amber-400" />
                                ) : i === 1 ? (
                                  <Medal className="mx-auto h-4 w-4 text-zinc-400" />
                                ) : i === 2 ? (
                                  <Medal className="mx-auto h-4 w-4 text-amber-700" />
                                ) : (
                                  <span className="text-xs text-zinc-600">
                                    {i + 1}
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                                {m.name}
                                {m.isYou && (
                                  <span className="ml-1.5 text-xs text-zinc-500">
                                    (you)
                                  </span>
                                )}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-sm font-semibold tabular-nums",
                                  (m.todayDollar ?? 0) >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                )}
                              >
                                {m.todayPct != null ? percent(m.todayPct) : "—"}
                              </span>
                              <span className="hidden shrink-0 text-xs tabular-nums text-zinc-500 sm:inline">
                                {signedCurrency(m.todayDollar)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </section>
                  )}

                  {overview.topHoldings.length > 0 && (
                    <section className="space-y-3">
                      <h2 className="text-sm font-medium text-zinc-200">
                        What the community is holding
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {overview.topHoldings.slice(0, 10).map((t) => (
                          <div
                            key={t.ticker}
                            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                          >
                            <span className="text-sm font-semibold text-white">
                              {t.ticker}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {currency(t.currentValue, 0)}
                            </span>
                            {t.todayPct != null && (
                              <span
                                className={cn(
                                  "text-xs tabular-nums",
                                  t.todayPct >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                )}
                              >
                                {percent(t.todayPct)}
                              </span>
                            )}
                            {t.portfolios.length > 1 && (
                              <span
                                className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-bright"
                                title={`Held in ${t.portfolios.join(", ")}`}
                              >
                                ×{t.portfolios.length} books
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {membersWithBooks.length > 0 && (
                    <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-7">
                      <div className="mb-5 flex items-center gap-2.5">
                        <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300">
                          <Gauge className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Risk &amp; diversification
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            Not advice — just a fun comparison of how each book
                            is built
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {membersWithBooks
                          .filter((m) => m.personality)
                          .map((m) => (
                            <div key={m.id} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-zinc-200">
                                  {m.personality?.animalEmoji} {m.name}
                                </span>
                                <span className="text-zinc-500">
                                  Diversified {m.personality?.diversificationScore}{" "}
                                  · Risk {m.personality?.riskScore}
                                </span>
                              </div>
                              <MiniBar
                                label="Diversified"
                                value={m.personality?.diversificationScore ?? 0}
                                color="#38bdf8"
                                hideLabel
                              />
                              <MiniBar
                                label="Risk"
                                value={m.personality?.riskScore ?? 0}
                                color="#f472b6"
                                hideLabel
                              />
                            </div>
                          ))}
                      </div>
                    </section>
                  )}

                  <section className="overview-fade rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-[#161618]/40 to-[#161618]/40 p-4 sm:p-7">
                    <div className="mb-5 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-xl bg-amber-500/15 p-2 text-amber-300">
                          <Lightbulb className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Community fun facts
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            {funFactsShuffle > 0
                              ? "Shuffled — reload for the daily batch"
                              : "New batch every day"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFunFactsShuffle((n) => n + 1)}
                        className="touch-target inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-500/10 active:scale-95"
                        title="Get a fresh random batch"
                      >
                        <Shuffle className="h-3.5 w-3.5" />
                        Shuffle
                      </button>
                    </div>
                    <ul className="space-y-3">
                      {communityFunFacts.length === 0 ? (
                        <li className="text-sm text-zinc-500">
                          Not enough data yet — check back once books load.
                        </li>
                      ) : (
                        communityFunFacts.map((fact, i) => (
                          <li
                            key={`${i}-${fact.slice(0, 24)}`}
                            className="rounded-2xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3.5 text-sm leading-relaxed text-zinc-200"
                          >
                            {fact}
                          </li>
                        ))
                      )}
                    </ul>
                  </section>
                </>
              )}

              {view === "members" && (
                <>
                  <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                      <Users className="h-4 w-4 text-zinc-500" />
                      Members
                    </h2>
                    <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
                      {members.map((m) => {
                        const sheetIds = new Set(
                          ownership
                            .filter((o) => o.user_id === m.user_id)
                            .map((o) => o.portfolio_id)
                        );
                        const sheets = portfolios.filter((p) => sheetIds.has(p.id));
                        const sheetValue = sheets.reduce((sum, p) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === p.id
                          );
                          return sum + (score?.totalValue ?? 0);
                        }, 0);
                        const sheetToday = sheets.reduce((sum, p) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === p.id
                          );
                          return sum + (score?.todayDollar ?? 0);
                        }, 0);
                        const memberTickerValues = holdings
                          .filter((h) => sheetIds.has(h.portfolio_id))
                          .map((h) => ({
                            ticker: h.ticker,
                            value:
                              h.shares * (quotes[h.ticker]?.price ?? h.buy_price),
                          }));
                        const personality =
                          memberTickerValues.length > 0
                            ? buildPortfolioPersonality(memberTickerValues)
                            : null;
                        const emails = memberEmails(m);
                        return (
                          <li
                            key={m.user_id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOwnerId(m.user_id);
                                setSelectedPortfolioId(null);
                              }}
                              className="text-left"
                            >
                              <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                                {profileName(m.user_id)}
                                {m.is_you && (
                                  <span className="text-xs text-zinc-500">
                                    (you)
                                  </span>
                                )}
                                {personality && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-bright"
                                    title={`${personality.tagline} Diversification ${personality.diversificationScore}/100 · Risk ${personality.riskScore}/100.`}
                                  >
                                    <span aria-hidden>
                                      {personality.animalEmoji}
                                    </span>
                                    {personality.animal}
                                  </span>
                                )}
                              </div>
                              {m.profile?.bio ? (
                                <div className="text-xs text-zinc-400">
                                  {m.profile.bio}
                                </div>
                              ) : null}
                              {emails.length > 1 ? (
                                <div className="text-xs text-zinc-500">
                                  {emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-xs text-zinc-500">
                                {m.role}
                                {" · "}
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {" · "}
                                {currency(sheetValue)}
                                {sheets.length > 0 && (
                                  <>
                                    {" · today "}
                                    <span
                                      className={
                                        sheetToday >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
                                      }
                                    >
                                      {signedCurrency(sheetToday)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>
                            {isAdmin && !m.is_you && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void setRole(
                                      m.user_id,
                                      m.role === "admin" ? "member" : "admin"
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                                >
                                  <Shield className="h-3 w-3" />
                                  {m.role === "admin" ? "Demote" : "Make admin"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    setRemoveTarget({
                                      userId: m.user_id,
                                      name: profileName(m.user_id),
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-red-300"
                                >
                                  <UserMinus className="h-3 w-3" />
                                  Remove
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {pendingMembers.map((p) => {
                        const sheets = portfolios.filter((x) =>
                          p.portfolio_ids.includes(x.id)
                        );
                        const sheetValue = sheets.reduce((sum, sheet) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === sheet.id
                          );
                          return sum + (score?.totalValue ?? 0);
                        }, 0);
                        const sheetToday = sheets.reduce((sum, sheet) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === sheet.id
                          );
                          return sum + (score?.todayDollar ?? 0);
                        }, 0);
                        const ownerKey = `pending:${p.key}`;
                        return (
                          <li
                            key={ownerKey}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOwnerId(ownerKey);
                                setSelectedPortfolioId(null);
                              }}
                              className="text-left"
                            >
                              <div className="text-sm font-medium text-zinc-100">
                                {p.label}
                                <span className="ml-2 text-xs font-normal text-amber-500/90">
                                  awaiting sign-in
                                </span>
                              </div>
                              {p.emails.length ? (
                                <div className="text-xs text-zinc-500">
                                  {p.emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-xs text-zinc-500">
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {" · "}
                                {currency(sheetValue)}
                                {sheets.length > 0 && (
                                  <>
                                    {" · today "}
                                    <span
                                      className={
                                        sheetToday >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
                                      }
                                    >
                                      {signedCurrency(sheetToday)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {isAdmin && (
                    <section className="space-y-3 rounded-xl border border-zinc-800 p-4">
                      <h2 className="text-sm font-medium text-zinc-200">
                        Admin · invite
                      </h2>
                      <p className="text-xs text-zinc-500">
                        Invites join the community; members share their whole
                        book read-only.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Email (optional)"
                          className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void createInvite()}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Create invite link
                        </button>
                      </div>
                      {inviteUrl && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2">
                          <p className="min-w-0 flex-1 break-all text-xs text-emerald-300/90">
                            {inviteUrl}
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard
                                .writeText(inviteUrl)
                                .catch(() => undefined);
                              setInviteCopied(true);
                              window.setTimeout(
                                () => setInviteCopied(false),
                                1500
                              );
                            }}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-700/60 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-900/40"
                          >
                            {inviteCopied ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {inviteCopied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}

          {!loading && selectedOwnerId && !selectedPortfolioId && (
            <section className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedOwnerId(null)}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to community
              </button>
              <div>
                <h2 className="text-lg font-semibold">
                  {profileName(selectedOwnerId)}
                </h2>
                <p className="text-xs text-zinc-500">
                  Read-only · owned by {profileName(selectedOwnerId)}
                </p>
              </div>
              <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
                {portfolios
                  .filter((p) =>
                    ownership.some(
                      (o) =>
                        o.portfolio_id === p.id && o.user_id === selectedOwnerId
                    )
                  )
                  .map((p) => {
                    const score = overview.sheets.find(
                      (s) => s.portfolio.id === p.id
                    );
                    const tickerValues = holdings
                      .filter((h) => h.portfolio_id === p.id)
                      .map((h) => ({
                        ticker: h.ticker,
                        value: h.shares * (quotes[h.ticker]?.price ?? h.buy_price),
                      }));
                    const personality =
                      tickerValues.length > 0
                        ? buildPortfolioPersonality(tickerValues)
                        : null;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedPortfolioId(p.id)}
                          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-900/50"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="text-sm font-medium">{p.name}</span>
                            {personality && (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-bright"
                                title={`${personality.tagline} Diversification ${personality.diversificationScore}/100 · Risk ${personality.riskScore}/100.`}
                              >
                                <span aria-hidden>{personality.animalEmoji}</span>
                                {personality.animal}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-400">
                            {currency(score?.totalValue ?? 0)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          {!loading && selectedPortfolio && (
            <section className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedPortfolioId(null)}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {profileName(selectedOwnerId!)}’s portfolios
              </button>
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedPortfolio.name}
                </h2>
                <p className="text-xs text-amber-500/90">
                  Read-only · owned by{" "}
                  {profileName(
                    selectedPortfolio.owner_id ?? selectedOwnerId!
                  )}
                </p>
              </div>
              <ReadOnlyHoldings
                holdings={selectedHoldings}
                quotes={quotes}
                cash={selectedPortfolio.cash_balance}
              />
            </section>
          )}
        </main>
      </div>

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove member?"
        body={`Remove ${removeTarget?.name ?? "this member"} from the community? They'll lose read access to everyone else's book and can be re-invited later.`}
        confirmLabel="Remove"
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return false;
          return removeMember(removeTarget.userId);
        }}
      />
    </SignInGate>
  );
}

function MiniBar({
  label,
  value,
  color,
  hideLabel = false,
}: {
  label: string;
  value: number;
  color: string;
  hideLabel?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {!hideLabel && (
        <span className="w-16 shrink-0 text-[10px] text-zinc-500">{label}</span>
      )}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            backgroundColor: color,
          }}
        />
      </div>
      {!hideLabel && (
        <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
          {Math.round(value)}
        </span>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "up" && "text-emerald-400",
          tone === "down" && "text-red-400"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function ReadOnlyHoldings({
  holdings,
  quotes,
  cash,
}: {
  holdings: Holding[];
  quotes: Record<string, Quote>;
  cash: number;
}) {
  const totalValue =
    holdings.reduce((s, h) => s + (quotes[h.ticker]?.price ?? 0) * h.shares, 0) +
    cash;
  const totalCost = holdings.reduce((s, h) => s + h.buy_price * h.shares, 0);
  const totalPnl = holdings.reduce((s, h) => {
    const price = quotes[h.ticker]?.price ?? 0;
    return s + (price - h.buy_price) * h.shares;
  }, 0);
  const totalRoiPct = totalCost > 0 ? totalPnl / totalCost : 0;
  const previousCloseValue =
    holdings.reduce(
      (s, h) => s + (quotes[h.ticker]?.previousClose ?? quotes[h.ticker]?.price ?? 0) * h.shares,
      0
    ) + cash;
  const todayDollar = totalValue - previousCloseValue;
  const todayPct = previousCloseValue > 0 ? todayDollar / previousCloseValue : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total value" value={currency(totalValue)} />
        <Stat
          label="Today"
          value={signedCurrency(todayDollar)}
          sub={todayPct != null ? percent(todayPct) : undefined}
          tone={todayDollar >= 0 ? "up" : "down"}
        />
        <Stat
          label="Unrealized P&L"
          value={signedCurrency(totalPnl)}
          sub={percent(totalRoiPct)}
          tone={totalPnl >= 0 ? "up" : "down"}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-zinc-800 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium">% Book</th>
              <th className="px-3 py-2 font-medium">Shares</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Today</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">ROI %</th>
              <th className="px-3 py-2 font-medium">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const price = quotes[h.ticker]?.price ?? 0;
              const value = price * h.shares;
              const cost = h.buy_price * h.shares;
              const pnl = value - cost;
              const roiPct = cost > 0 ? pnl / cost : 0;
              const todayPct = quotes[h.ticker]?.changePercent ?? null;
              const pctBook = totalValue > 0 ? value / totalValue : 0;
              return (
                <tr key={h.id} className="border-b border-zinc-800/60">
                  <td className="px-3 py-2 font-medium">{h.ticker}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">
                    {percent(pctBook)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-400">
                    {h.shares}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-white">
                    {currency(price)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      todayPct == null
                        ? "text-zinc-600"
                        : todayPct >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                    )}
                  >
                    {todayPct != null ? percent(todayPct) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{currency(value)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      roiPct >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {percent(roiPct)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {signedCurrency(pnl)}
                  </td>
                </tr>
              );
            })}
            {holdings.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-500" colSpan={8}>
                  No holdings on this sheet.
                </td>
              </tr>
            )}
            <tr>
              <td className="px-3 py-2 text-zinc-500" colSpan={6}>
                Cash
              </td>
              <td className="px-3 py-2 tabular-nums" colSpan={2}>
                {currency(cash)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
