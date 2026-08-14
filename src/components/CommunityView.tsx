"use client";

import { DailyDuelCard } from "@/components/DailyDuelCard";
import { SignInGate } from "@/components/SignInGate";
import { BookBottomNav } from "@/components/BookBottomNav";
import { AppHeader } from "@/components/AppHeader";
import { MobileChrome } from "@/components/mobile/MobileChrome";
import { track } from "@vercel/analytics";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { currency, percent, signedCurrency, cn, cashtag, signedTone } from "@/lib/format";
import { buildOverview } from "@/lib/overview";
import {
  loadCommunityCache,
  saveCommunityCache,
  clearCommunityCache,
} from "@/lib/community-cache";
import {
  buildPortfolioPersonality,
  ANIMAL_BESTIARY,
  THEME_COLOR,
  THEME_LABEL,
  animalCardTone,
  type PortfolioPersonality,
} from "@/lib/portfolio-personality";
import {
  forecastThemeForTicker,
  type ForecastTheme,
} from "@/lib/forecast-conviction";
import { buildCommunityFunFacts } from "@/lib/community-fun-facts";
import { loadCachedQuotes, mergeQuotes, saveCachedQuotes } from "@/lib/quote-cache";
import { COMPOUND_MILESTONE_GOALS } from "@/lib/compound-play";
import { todayKeyInTz } from "@/lib/timezone";
import type { Holding, Portfolio, Quote } from "@/lib/types";
import {
  Award,
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Globe,
  HelpCircle,
  LayoutGrid,
  Lightbulb,
  Link2,
  Lock,
  LogOut,
  Medal,
  Layers,
  PieChart,
  Settings,
  Shield,
  Shuffle,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { quotePollMs, quotesUrl } from "@/lib/market/session";

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
  visibility?: "public" | "private";
  created_by: string | null;
};

type JoinRequest = {
  id: string;
  user_id: string;
  message: string | null;
  requested_at: string;
  profile: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
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
  join_requests?: JoinRequest[];
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

/** "Martin Aasa" + "Amanda Aasa" -> "Martin & Amanda Aasa". Falls back to
 * joining full names when surnames don't match (or there's no clean last
 * word to share), and to a plain "&" join for 3+ people. */
function combineHouseholdNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "Household";
  if (clean.length > 2) return clean.join(", ").replace(/, ([^,]*)$/, " & $1");

  const parts = clean.map((n) => n.split(/\s+/));
  const lastWords = parts.map((p) => p[p.length - 1] ?? "");
  const sameSurname = Boolean(lastWords[0]) && lastWords.every((w) => w === lastWords[0]);
  if (sameSurname && parts.every((p) => p.length > 1)) {
    const firstNames = parts.map((p) => p.slice(0, -1).join(" "));
    return `${firstNames.join(" & ")} ${lastWords[0]}`;
  }
  return clean.join(" & ");
}

export function CommunityView({ communityId }: Props) {
  const router = useRouter();
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
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>(
    () => initialCacheRef.current.meta?.join_requests ?? []
  );
  const [joinDecisionBusyId, setJoinDecisionBusyId] = useState<string | null>(
    null
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
  // Community books paint instantly from cache, so without seeding prices
  // too every member's value would render at cost basis for a beat.
  const [quotes, setQuotes] = useState<Record<string, Quote>>(
    () => loadCachedQuotes().quotes
  );
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
  const [leaderboardRange, setLeaderboardRange] = useState<
    "today" | "lifetime" | "spread" | "risk" | "conviction"
  >("today");
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
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
  // Mount + visibility-regain can both trigger `load()` in quick succession
  // (e.g. flip tabs away and back before the first request lands). Without
  // this, whichever request happens to resolve last wins, even if it was
  // the older/stale one — a classic out-of-order response race. Only the
  // most-recently-started call is allowed to commit state.
  const loadCallIdRef = useRef(0);

  const load = useCallback(async () => {
    const callId = ++loadCallIdRef.current;
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
      if (callId !== loadCallIdRef.current) return;
      setCommunity(meta.community);
      setMembers(meta.members ?? []);
      setPendingMembers(meta.pending_members ?? []);
      setIsAdmin(Boolean(meta.isAdmin));
      setJoinRequests(meta.join_requests ?? []);
      setPortfolios(book.portfolios ?? []);
      setHoldings(book.holdings ?? []);
      setProfiles(book.profiles ?? []);
      setOwnership(book.ownership ?? []);
      hasDataRef.current = true;
      saveCommunityCache(communityId, { meta, book });
    } catch (e) {
      if (callId !== loadCallIdRef.current) return;
      // A background refresh failing behind already-visible cached
      // content shouldn't slap an error over it — only surface the error
      // when there was nothing on screen to begin with.
      if (!isBackgroundRefresh) {
        setError(e instanceof Error ? e.message : "Failed to load community");
      }
    } finally {
      if (callId === loadCallIdRef.current) setLoading(false);
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
    let timer = 0;
    const tick = async () => {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch(quotesUrl(tickers));
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const fresh = (data.quotes ?? {}) as Record<string, Quote>;
        let merged = fresh;
        setQuotes((prev) => {
          merged = mergeQuotes(prev, fresh);
          return merged;
        });
        saveCachedQuotes(merged);
      } catch {
        /* ignore */
      }
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        void tick().then(() => {
          if (!cancelled) schedule();
        });
      }, quotePollMs());
    };
    void tick();
    schedule();
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
  type PersonMilestone = {
    total: number;
    hitCount: number;
    goalCount: number;
    next: number | null;
    remaining: number;
    progress: number;
    lastGoal: number;
  };
  type MemberStat = {
    id: string;
    name: string;
    isYou: boolean;
    isPending: boolean;
    sheetCount: number;
    sheetKey: string;
    totalValue: number;
    todayDollar: number;
    todayPct: number | null;
    roiPct: number;
    personality: PortfolioPersonality | null;
    milestone: PersonMilestone;
  };

  const memberStats = useMemo<MemberStat[]>(() => {
    const milestoneFor = (total: number): PersonMilestone => {
      const hitCount = COMPOUND_MILESTONE_GOALS.filter((g) => total >= g).length;
      const next = COMPOUND_MILESTONE_GOALS.find((g) => total < g) ?? null;
      const lastGoal =
        [...COMPOUND_MILESTONE_GOALS].reverse().find((g) => total >= g) ?? 0;
      // Progress WITHIN the current bracket (lastGoal -> next), so the bar
      // fill actually lines up with the lastGoal/next labels instead of
      // always reading against zero.
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
    };

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
      const cash = sheets.reduce((s, p) => s + p.cash_balance, 0);
      const tickerValues = holdings
        .filter((h) => sheetIds.has(h.portfolio_id))
        .map((h) => ({
          ticker: h.ticker,
          value: h.shares * (quotes[h.ticker]?.price ?? h.buy_price),
        }));
      const personality =
        tickerValues.length > 0
          ? buildPortfolioPersonality(tickerValues, cash)
          : null;
      return {
        id,
        name,
        isYou,
        isPending,
        sheetCount: sheets.length,
        sheetKey: [...sheetIds].sort().join(","),
        totalValue,
        todayDollar,
        todayPct,
        roiPct,
        personality,
        milestone: milestoneFor(totalValue),
      };
    };

    const rawMembers: MemberStat[] = members.map((m) => {
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

    // Co-owners of the exact same sheet(s) are one household, not two
    // separate "members" — a couple sharing a book shouldn't double up in
    // the leaderboard/power-animals grid with identical numbers twice.
    const bySheetKey = new Map<string, MemberStat[]>();
    const solo: MemberStat[] = [];
    for (const m of rawMembers) {
      if (!m.sheetKey) {
        solo.push(m);
        continue;
      }
      const arr = bySheetKey.get(m.sheetKey) ?? [];
      arr.push(m);
      bySheetKey.set(m.sheetKey, arr);
    }
    const list: MemberStat[] = [...solo];
    for (const group of bySheetKey.values()) {
      if (group.length === 1) {
        list.push(group[0]!);
        continue;
      }
      const first = group[0]!;
      list.push({
        ...first,
        name: combineHouseholdNames(group.map((g) => g.name)),
        isYou: group.some((g) => g.isYou),
      });
    }

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

  // Fun superlative badges — deliberately don't repeat what the leaderboard
  // already shows (today's move, lifetime return); these highlight the
  // axes only Power Animals surfaces, so nothing here is a duplicate view
  // of another section's data.
  type Achievement = {
    id: string;
    emoji: string;
    title: string;
    winner: string;
    stat: string;
    description: string;
  };
  const achievements = useMemo<Achievement[]>(() => {
    const withPersonality = membersWithBooks.filter((m) => m.personality);
    if (withPersonality.length === 0) return [];
    const out: Achievement[] = [];

    const mostDiversified = [...withPersonality].sort(
      (a, b) => b.personality!.diversificationScore - a.personality!.diversificationScore
    )[0]!;
    out.push({
      id: "diversifier",
      emoji: "🌐",
      title: "The Diversifier",
      winner: mostDiversified.name,
      stat: `${mostDiversified.personality!.diversificationScore}/100`,
      description: "Most spread-out book in the circle.",
    });

    const mostRisk = [...withPersonality].sort(
      (a, b) => b.personality!.riskScore - a.personality!.riskScore
    )[0]!;
    out.push({
      id: "risk-taker",
      emoji: "🔥",
      title: "The Risk Taker",
      winner: mostRisk.name,
      stat: `${mostRisk.personality!.riskScore}/100`,
      description: "Runs the hottest theme mix, hands down.",
    });

    const steadiest = [...withPersonality].sort(
      (a, b) => a.personality!.riskScore - b.personality!.riskScore
    )[0]!;
    out.push({
      id: "steady-hand",
      emoji: "🛡️",
      title: "The Steady Hand",
      winner: steadiest.name,
      stat: `${steadiest.personality!.riskScore}/100`,
      description: "Calmest, most defensive book in the group.",
    });

    const mostConviction = [...withPersonality].sort(
      (a, b) => b.personality!.convictionScore - a.personality!.convictionScore
    )[0]!;
    if (mostConviction.personality!.convictionScore >= 30) {
      out.push({
        id: "conviction",
        emoji: "🎯",
        title: "Highest conviction",
        winner: mostConviction.name,
        stat: `${mostConviction.personality!.convictionScore}%${
          mostConviction.personality!.topTicker
            ? ` ${cashtag(mostConviction.personality!.topTicker)}`
            : ""
        }`,
        description: "Biggest single name relative to the rest of the book.",
      });
    }

    const mostThemes = [...withPersonality].sort(
      (a, b) => b.personality!.themeCount - a.personality!.themeCount
    )[0]!;
    if (mostThemes.personality!.themeCount >= 2) {
      out.push({
        id: "themes",
        emoji: "🐙",
        title: "Most habitats",
        winner: mostThemes.name,
        stat: `${mostThemes.personality!.themeCount} themes`,
        description: "The book with a tentacle in the most ponds.",
      });
    }

    const mostCash = [...withPersonality].sort(
      (a, b) => b.personality!.cashPct - a.personality!.cashPct
    )[0]!;
    if (mostCash.personality!.cashPct >= 8) {
      out.push({
        id: "dry-powder",
        emoji: "🐿️",
        title: "Driest powder",
        winner: mostCash.name,
        stat: `${mostCash.personality!.cashPct}% cash`,
        description: "Largest cash stash relative to the book.",
      });
    }

    const mostSpecialist = [...withPersonality]
      .filter((m) => m.personality!.specialistScore >= 55)
      .sort(
        (a, b) => b.personality!.specialistScore - a.personality!.specialistScore
      )[0];
    if (mostSpecialist) {
      out.push({
        id: "specialist",
        emoji: "🐼",
        title: "One-theme diet",
        winner: mostSpecialist.name,
        stat: `${mostSpecialist.personality!.specialistScore}%`,
        description: "Heaviest bet on a single theme.",
      });
    }
    const biggestBook = [...membersWithBooks].sort(
      (a, b) => b.totalValue - a.totalValue
    )[0]!;
    const smallestBook = [...membersWithBooks].sort(
      (a, b) => a.totalValue - b.totalValue
    )[0]!;
    if (biggestBook.id !== smallestBook.id) {
      out.push({
        id: "big-book",
        emoji: "🏦",
        title: "The Big Book",
        winner: biggestBook.name,
        stat: currency(biggestBook.totalValue, 0),
        description: "Largest total portfolio in the family.",
      });
      out.push({
        id: "small-mighty",
        emoji: "🐜",
        title: "Small but Mighty",
        winner: smallestBook.name,
        stat: currency(smallestBook.totalValue, 0),
        description: "Smallest book, every family tree has a sapling.",
      });
    }

    const closestToGoal = [...membersWithBooks]
      .filter((m) => m.milestone.next != null)
      .sort((a, b) => a.milestone.remaining - b.milestone.remaining)[0];
    if (closestToGoal) {
      out.push({
        id: "closest-milestone",
        emoji: "🏁",
        title: "On the Doorstep",
        winner: closestToGoal.name,
        stat: `${currency(closestToGoal.milestone.remaining, 0)} away`,
        description: `Closest to hitting ${currency(closestToGoal.milestone.next ?? 0, 0)}.`,
      });
    }

    return out;
  }, [membersWithBooks]);

  // Combined family sector fingerprint — every member's holdings pooled
  // into one dollar-weighted theme breakdown, a level up from "What the
  // community is holding" (which is per-ticker) to "what does the family
  // collectively believe in."
  const communityThemeBreakdown = useMemo(() => {
    const byTheme = new Map<string, number>();
    let total = 0;
    for (const t of overview.tickers) {
      if (t.currentValue <= 0) continue;
      const theme = forecastThemeForTicker(t.ticker);
      byTheme.set(theme, (byTheme.get(theme) ?? 0) + t.currentValue);
      total += t.currentValue;
    }
    if (total <= 0) return [];
    return [...byTheme.entries()]
      .map(([theme, value]) => ({
        theme: theme as ForecastTheme,
        label: THEME_LABEL[theme as ForecastTheme] ?? theme,
        value,
        pct: value / total,
      }))
      .sort((a, b) => b.value - a.value);
  }, [overview.tickers]);

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

  /** Every book the drilled-into member owns. */
  const ownerPortfolios = useMemo(() => {
    if (!selectedOwnerId) return [];
    return portfolios.filter((p) =>
      ownership.some(
        (o) => o.portfolio_id === p.id && o.user_id === selectedOwnerId
      )
    );
  }, [portfolios, ownership, selectedOwnerId]);

  /**
   * Holdings for the current drill-down. Opening a member shows every book
   * pooled, so a ticker held in two of them collapses into one row with a
   * share-weighted average cost, which is what "combined" has to mean for
   * the ROI column to be right. Picking a single book skips the merge.
   */
  const selectedHoldings = useMemo(() => {
    if (selectedPortfolioId) {
      return holdings.filter((h) => h.portfolio_id === selectedPortfolioId);
    }
    const ids = new Set(ownerPortfolios.map((p) => p.id));
    const mine = holdings.filter((h) => ids.has(h.portfolio_id));
    const byTicker = new Map<string, Holding>();
    for (const h of mine) {
      const prev = byTicker.get(h.ticker);
      if (!prev) {
        byTicker.set(h.ticker, { ...h });
        continue;
      }
      const shares = prev.shares + h.shares;
      byTicker.set(h.ticker, {
        ...prev,
        shares,
        buy_price:
          shares > 0
            ? (prev.buy_price * prev.shares + h.buy_price * h.shares) / shares
            : prev.buy_price,
      });
    }
    return [...byTicker.values()];
  }, [selectedPortfolioId, ownerPortfolios, holdings]);

  const selectedCash = selectedPortfolio
    ? selectedPortfolio.cash_balance
    : ownerPortfolios.reduce((s, p) => s + p.cash_balance, 0);

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

  function openSettings() {
    setSettingsName(community?.name ?? "");
    setSettingsError(null);
    setSettingsOpen(true);
  }

  async function handleRename() {
    const name = settingsName.trim();
    if (!name || name === community?.name) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Rename failed");
      }
      setCommunity((data as { community: CommunityMeta }).community);
      setSettingsOpen(false);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleVisibilityChange(next: "public" | "private") {
    if (!community || community.visibility === next) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Update failed");
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function decideJoinRequest(userId: string, decision: "approve" | "reject") {
    setJoinDecisionBusyId(userId);
    try {
      const res = await fetch(`/api/communities/${communityId}/join-request`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Decision failed");
      }
      setJoinRequests((rows) => rows.filter((r) => r.user_id !== userId));
      if (decision === "approve") await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setJoinDecisionBusyId(null);
    }
  }

  async function handleLeaveCommunity() {
    const me = members.find((m) => m.is_you);
    if (!me) throw new Error("Could not work out which member you are");
    const res = await fetch(
      `/api/communities/${communityId}/members/${me.user_id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Leave failed");
    }
    clearCommunityCache(communityId);
    router.push("/communities");
    return true;
  }

  async function handleDeleteCommunity() {
    const res = await fetch(`/api/communities/${communityId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Delete failed");
    }
    clearCommunityCache(communityId);
    router.push("/communities");
    return true;
  }

  return (
    <SignInGate>
      <div className="flex min-h-dvh flex-col bg-black text-zinc-100 md:bg-app">
        <MobileChrome
          title={community?.name ?? "Community"}
          active="explore"
          end={
            isAdmin && community ? (
              <button
                type="button"
                onClick={openSettings}
                title="Community settings"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300"
              >
                <Settings className="h-5 w-5" />
              </button>
            ) : undefined
          }
        />
        <AppHeader
          className="hidden md:block"
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{community?.name ?? "Community"}</span>
              {community && (
                <span
                  title={
                    community.visibility === "public"
                      ? "Public community"
                      : "Private community"
                  }
                >
                  {community.visibility === "public" ? (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  )}
                </span>
              )}
            </span>
          }
        >
          {isAdmin && joinRequests.length > 0 && (
            <span
              title={`${joinRequests.length} pending join request${joinRequests.length === 1 ? "" : "s"}`}
              className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300"
            >
              {joinRequests.length}
            </span>
          )}
          {isAdmin && community && (
            <button
              type="button"
              onClick={openSettings}
              title="Community settings"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </AppHeader>

        <main className="mx-auto max-w-6xl flex-1 space-y-8 px-4 py-6 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {loading && (
            <p className="text-sm text-zinc-400">Loading community …</p>
          )}
          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {!loading && !selectedOwnerId && (
            <>
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  Everyone&apos;s books added together. Live, read-only.
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
                    tone={
                      overview.totals.todayDollar > 0
                        ? "up"
                        : overview.totals.todayDollar < 0
                          ? "down"
                          : undefined
                    }
                  />
                  <Stat
                    label="All-time"
                    value={signedCurrency(overview.totals.roiDollar)}
                    sub={percent(overview.totals.roiPct)}
                    tone={
                      overview.totals.roiDollar > 0
                        ? "up"
                        : overview.totals.roiDollar < 0
                          ? "down"
                          : undefined
                    }
                  />
                </div>
              </section>

              <DailyDuelCard
                communityId={communityId}
                tickers={overview.tickers.map((t) => ({
                  ticker: t.ticker,
                  todayPct: t.todayPct,
                }))}
              />

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
                <div className="flex flex-col gap-8">
                  {membersWithBooks.length > 0 && (
                    <section className="overview-fade order-3 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-6">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-xl bg-violet-500/15 p-2 text-violet-300">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white">
                              Power animals
                            </h3>
                            <p className="mt-0.5 text-sm text-zinc-400">
                              How each book is built. Tap someone to open their
                              sheets.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBestiaryOpen(true)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-brand/40 hover:text-white"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Field guide</span>
                        </button>
                      </div>
                      <div className="grid gap-5 lg:grid-cols-2">
                        {membersWithBooks.map((m) => (
                          <PowerAnimalCard
                            key={m.id}
                            name={m.name}
                            isYou={m.isYou}
                            isPending={m.isPending}
                            totalValue={m.totalValue}
                            personality={m.personality}
                            milestone={m.milestone}
                            onOpen={() => {
                              setSelectedOwnerId(m.id);
                              setSelectedPortfolioId(null);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {achievements.length > 0 && (
                    <section className="overview-fade order-2 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-6">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="rounded-xl bg-pink-500/15 p-2 text-pink-300">
                          <Award className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Community superlatives
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            Fun awards pulled from the numbers above
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {achievements.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xl" aria-hidden>
                                {a.emoji}
                              </span>
                              <p className="text-sm font-semibold text-white">
                                {a.title}
                              </p>
                            </div>
                            <p className="mt-1.5 truncate text-sm font-medium text-brand-bright">
                              {a.winner}{" "}
                              <span className="font-normal text-zinc-400">
                                · {a.stat}
                              </span>
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                              {a.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {membersWithBooks.length > 0 && (
                    <section className="overview-fade order-1 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-6">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-300">
                            <Trophy className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white">
                              Leaderboard
                            </h3>
                            <p className="mt-0.5 text-sm text-zinc-400">
                              {leaderboardRange === "today"
                                ? "Ranked by today's move"
                                : leaderboardRange === "lifetime"
                                  ? "Ranked by all-time return"
                                  : leaderboardRange === "spread"
                                    ? "Ranked by how spread out the book is"
                                    : leaderboardRange === "risk"
                                      ? "Ranked by theme heat"
                                      : "Ranked by the largest single name"}
                            </p>
                          </div>
                        </div>
                        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {(
                            [
                              ["today", "Today"],
                              ["lifetime", "All-time"],
                              ["spread", "Spread"],
                              ["risk", "Risk"],
                              ["conviction", "Conviction"],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setLeaderboardRange(id)}
                              className={cn(
                                "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                                leaderboardRange === id
                                  ? "bg-brand/20 text-brand-bright"
                                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {[...membersWithBooks]
                          .sort((a, b) => {
                            if (leaderboardRange === "today")
                              return (b.todayPct ?? -1) - (a.todayPct ?? -1);
                            if (leaderboardRange === "lifetime")
                              return b.roiPct - a.roiPct;
                            if (leaderboardRange === "spread")
                              return (
                                (b.personality?.diversificationScore ?? -1) -
                                (a.personality?.diversificationScore ?? -1)
                              );
                            if (leaderboardRange === "risk")
                              return (
                                (b.personality?.riskScore ?? -1) -
                                (a.personality?.riskScore ?? -1)
                              );
                            return (
                              (b.personality?.convictionScore ?? -1) -
                              (a.personality?.convictionScore ?? -1)
                            );
                          })
                          .map((m, i) => {
                            const built =
                              leaderboardRange === "spread" ||
                              leaderboardRange === "risk" ||
                              leaderboardRange === "conviction";
                            const pct =
                              leaderboardRange === "today"
                                ? m.todayPct
                                : leaderboardRange === "lifetime"
                                  ? m.roiPct
                                  : null;
                            const builtScore =
                              leaderboardRange === "spread"
                                ? m.personality?.diversificationScore
                                : leaderboardRange === "risk"
                                  ? m.personality?.riskScore
                                  : m.personality?.convictionScore;
                            return (
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
                                    <span className="text-xs text-zinc-400">
                                      {i + 1}
                                    </span>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                                  {m.name}
                                  {m.isYou && (
                                    <span className="ml-1.5 text-xs text-zinc-400">
                                      (you)
                                    </span>
                                  )}
                                </span>
                                {/* Both numeric columns are fixed-width and
                                  * right-aligned. Without a width they only
                                  * packed against the right edge, so a row
                                  * showing -$5,114.99 pushed its percent
                                  * left of a row showing +$0.81 and the
                                  * column zig-zagged down the list. */}
                                <span
                                  className={cn(
                                    "w-16 shrink-0 text-right text-sm font-semibold tabular-nums",
                                    built
                                      ? "text-white"
                                      : signedTone(pct, "text-zinc-400")
                                  )}
                                >
                                  {built
                                    ? builtScore != null
                                      ? leaderboardRange === "conviction"
                                        ? `${builtScore}%`
                                        : `${builtScore}`
                                      : "—"
                                    : pct != null
                                      ? percent(pct)
                                      : "—"}
                                </span>
                                {/* Whole dollars: cents are noise on a
                                  * leaderboard, and at two decimals a
                                  * seven-figure book overflows the column. */}
                                {leaderboardRange === "today" && (
                                  <span
                                    className={cn(
                                      "hidden w-24 shrink-0 text-right text-xs tabular-nums sm:inline-block",
                                      signedTone(m.todayDollar, "text-zinc-400")
                                    )}
                                  >
                                    {signedCurrency(m.todayDollar, 0)}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                      </ul>
                    </section>
                  )}

                  {overview.topHoldings.length > 0 && (
                    <section className="overview-fade order-4 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-6">
                      <div className="mb-5 flex items-center gap-2.5">
                        <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-300">
                          <Layers className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            What the community is holding
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            Biggest combined positions, and how many books
                            each one turns up in
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {overview.topHoldings.slice(0, 10).map((t) => (
                          <div
                            key={t.ticker}
                            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                          >
                            <span className="text-sm font-semibold text-white">
                              {cashtag(t.ticker)}
                            </span>
                            <span className="text-xs text-zinc-400">
                              {currency(t.currentValue, 0)}
                            </span>
                            {t.todayPct != null && (
                              <span
                                className={cn(
                                  "text-xs tabular-nums",
                                  signedTone(t.todayPct, "text-zinc-400")
                                )}
                              >
                                {percent(t.todayPct)}
                              </span>
                            )}
                            {t.portfolios.length > 1 && (
                              <span
                                className="rounded-full bg-brand/15 px-1.5 py-0.5 text-xs font-medium text-brand-bright"
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

                  {communityThemeBreakdown.length > 0 && (
                    <section className="overview-fade order-5 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-6">
                      <div className="mb-5 flex items-center gap-2.5">
                        <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300">
                          <PieChart className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            What the circle owns
                          </h3>
                          <p className="mt-0.5 text-sm text-zinc-400">
                            Everyone&apos;s holdings pooled by theme. How the
                            circle is built, not a recommendation.
                          </p>
                        </div>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-900">
                        {communityThemeBreakdown.map((t) => (
                          <div
                            key={t.theme}
                            style={{
                              width: `${Math.max(1.5, t.pct * 100)}%`,
                              backgroundColor: THEME_COLOR[t.theme],
                            }}
                            title={`${t.label}: ${Math.round(t.pct * 100)}%`}
                          />
                        ))}
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {communityThemeBreakdown.map((t) => (
                          <div
                            key={t.theme}
                            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2"
                          >
                            <span className="flex items-center gap-2 text-xs text-zinc-300">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: THEME_COLOR[t.theme] }}
                              />
                              {t.label}
                            </span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-400">
                              {Math.round(t.pct * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="overview-fade order-6 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-[#161618]/40 to-[#161618]/40 p-4 sm:p-6">
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
                              ? "Shuffled, reload for the daily batch"
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
                        <li className="text-sm text-zinc-400">
                          Not enough data yet. Check back once books load.
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
                </div>
              )}

              {view === "members" && (
                <>
                  <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                      <Users className="h-4 w-4 text-zinc-400" />
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
                        const memberCash = sheets.reduce(
                          (sum, p) => sum + p.cash_balance,
                          0
                        );
                        const memberTickerValues = holdings
                          .filter((h) => sheetIds.has(h.portfolio_id))
                          .map((h) => ({
                            ticker: h.ticker,
                            value:
                              h.shares * (quotes[h.ticker]?.price ?? h.buy_price),
                          }));
                        const personality =
                          memberTickerValues.length > 0
                            ? buildPortfolioPersonality(
                                memberTickerValues,
                                memberCash
                              )
                            : null;
                        const emails = memberEmails(m);
                        const animalTone = personality
                          ? animalCardTone(personality.archetype.id)
                          : null;
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
                                  <span className="text-xs text-zinc-400">
                                    (you)
                                  </span>
                                )}
                                {personality && animalTone && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                                      animalTone.border,
                                      animalTone.wash,
                                      animalTone.name
                                    )}
                                    title={personality.whyThisAnimal}
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
                                <div className="text-xs text-zinc-400">
                                  {emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-xs text-zinc-400">
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
                                      className={signedTone(
                                        sheetToday,
                                        "text-zinc-400"
                                      )}
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
                            {m.is_you && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setLeaveOpen(true)}
                                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-rose-800/60 hover:text-rose-300"
                              >
                                <LogOut className="h-3 w-3" />
                                Leave
                              </button>
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
                                <div className="text-xs text-zinc-400">
                                  {p.emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-xs text-zinc-400">
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {" · "}
                                {currency(sheetValue)}
                                {sheets.length > 0 && (
                                  <>
                                    {" · today "}
                                    <span
                                      className={signedTone(
                                        sheetToday,
                                        "text-zinc-400"
                                      )}
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

                  {isAdmin && joinRequests.length > 0 && (
                    <section className="space-y-3 rounded-xl border border-amber-800/50 bg-amber-950/10 p-4">
                      <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                        <UserCheck className="h-4 w-4 text-amber-400" />
                        Join requests
                        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                          {joinRequests.length}
                        </span>
                      </h2>
                      <p className="text-xs text-zinc-400">
                        This community is public, so anyone can ask to join,
                        but nothing happens until you approve them here.
                      </p>
                      <ul className="space-y-2">
                        {joinRequests.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-zinc-200">
                                {r.profile?.display_name ?? r.profile?.email ?? "Unknown"}
                              </p>
                              <p className="truncate text-xs text-zinc-400">
                                {r.profile?.email}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                type="button"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() => void decideJoinRequest(r.user_id, "approve")}
                                className="rounded-md bg-emerald-600/90 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() => void decideJoinRequest(r.user_id, "reject")}
                                className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {isAdmin && (
                    <section className="space-y-3 rounded-xl border border-zinc-800 p-4">
                      <h2 className="text-sm font-medium text-zinc-200">
                        Admin · invite
                      </h2>
                      <p className="text-xs text-zinc-400">
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

          {/* One view, not two. Opening a member used to land on a list of
            * their books, so seeing a single position always cost two
            * clicks (and for the many members with exactly one book, that
            * list was a page containing one row). It now opens on the
            * combined book, with a picker only when there's more than one
            * to pick from. */}
          {!loading && selectedOwnerId && (
            <section className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedPortfolioId(null);
                  setSelectedOwnerId(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to community
              </button>
              <div className="sticky top-16 z-20 space-y-3 rounded-xl border border-amber-500/40 bg-amber-950/70 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-sm">
                <p className="text-sm font-semibold text-amber-100">
                  Read-only · owned by{" "}
                  {memberStats.find((m) => m.id === selectedOwnerId)?.name ??
                    profileName(selectedOwnerId)}
                </p>
                <p className="text-xs leading-relaxed text-amber-200/80">
                  This is their book. You can look, you cannot edit. Nothing
                  you tap here changes their holdings.
                  {selectedPortfolio ? ` Viewing ${selectedPortfolio.name}.` : ""}
                </p>
              </div>

              {ownerPortfolios.length > 1 && (
                <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedPortfolioId(null)}
                    className={cn(
                      "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                      selectedPortfolioId === null
                        ? "border-brand/40 bg-brand/15 text-brand-bright"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    )}
                  >
                    All books
                    <span className="ml-1.5 text-zinc-400">
                      {ownerPortfolios.length}
                    </span>
                  </button>
                  {ownerPortfolios.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPortfolioId(p.id)}
                      className={cn(
                        "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        selectedPortfolioId === p.id
                          ? "border-brand/40 bg-brand/15 text-brand-bright"
                          : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              <ReadOnlyHoldings
                holdings={selectedHoldings}
                quotes={quotes}
                cash={selectedCash}
              />
            </section>
          )}
        </main>
        <BookBottomNav />
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

      <ConfirmModal
        open={leaveOpen}
        title="Leave this community?"
        body={`You'll stop seeing everyone else's book in ${community?.name ?? "this community"}, and they'll stop seeing yours. Your own portfolios and holdings stay exactly as they are. You can rejoin later with an invite, or by requesting again if it's public.`}
        confirmLabel="Leave"
        destructive
        onClose={() => setLeaveOpen(false)}
        onConfirm={handleLeaveCommunity}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete this community?"
        body={`This removes "${community?.name ?? "this community"}" for everyone. Members lose shared read access and the invite link stops working. Nobody's actual portfolio or holdings are touched, and it can't be undone.`}
        confirmLabel="Delete community"
        destructive
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteCommunity}
      />

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-t-2xl border border-zinc-700 bg-zinc-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-white">
                Community settings
              </h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="shrink-0 rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block text-xs font-medium text-zinc-400">
              Community name
            </label>
            <input
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename();
              }}
              maxLength={80}
              disabled={settingsBusy}
              className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand/50 disabled:opacity-50"
            />
            {settingsError && (
              <p className="mt-2 text-xs text-rose-400">{settingsError}</p>
            )}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void handleRename()}
                disabled={
                  settingsBusy ||
                  !settingsName.trim() ||
                  settingsName.trim() === community?.name
                }
                className="btn-primary disabled:opacity-40"
              >
                {settingsBusy ? "Saving …" : "Save name"}
              </button>
            </div>

            <div className="mt-5 border-t border-zinc-800 pt-4">
              <label className="block text-xs font-medium text-zinc-400">
                Visibility
              </label>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {community?.visibility === "public"
                  ? "Public: anyone signed in can find this community and ask to join. You still approve every request."
                  : "Private: invite-only. No one can find or join without a link."}
              </p>
              <div className="mt-2 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
                {(
                  [
                    ["private", Lock, "Private"],
                    ["public", Globe, "Public"],
                  ] as const
                ).map(([id, Icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={settingsBusy}
                    onClick={() => void handleVisibilityChange(id)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50",
                      (community?.visibility ?? "private") === id
                        ? "bg-brand/20 text-brand-bright"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div className="mt-6 rounded-xl border border-rose-900/40 bg-rose-950/20 p-3.5">
                <p className="text-xs font-semibold text-rose-300">
                  Danger zone
                </p>
                <p className="mt-1 text-xs leading-relaxed text-rose-300/70">
                  Deleting the community removes it for every member. Their
                  own portfolios and holdings are never affected.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setDeleteConfirmOpen(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete community
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {bestiaryOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setBestiaryOpen(false)}
          />
          <div className="relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:pb-5">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  The power animal field guide
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Every book gets scored on spread, risk, conviction, cash,
                  and how many themes it actually lives in, then matched to
                  whichever animal fits best. A fun lens, not an investing
                  verdict.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBestiaryOpen(false)}
                className="shrink-0 rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {ANIMAL_BESTIARY.map((a) => {
                const tone = animalCardTone(a.id);
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "relative overflow-hidden rounded-xl border p-3.5 pl-4",
                      tone.border,
                      tone.wash
                    )}
                  >
                    <span
                      className={cn("absolute inset-y-0 left-0 w-1", tone.bar)}
                      aria-hidden
                    />
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl",
                          tone.well
                        )}
                        aria-hidden
                      >
                        {a.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className={cn("text-sm font-semibold", tone.name)}>
                          {a.animal}
                        </p>
                        <p className="text-xs text-zinc-400">{a.criteria}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      {a.vibe}
                    </p>
                    <div className="mt-2 space-y-1 text-xs leading-relaxed">
                      <p className="flex gap-1.5 text-emerald-300/90">
                        <Shield className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{a.strength}</span>
                      </p>
                      <p className="flex gap-1.5 text-amber-300/90">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{a.watchFor}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </SignInGate>
  );
}

function signedPctPoints(n: number): string {
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `-${abs}%`;
  return `${abs}%`;
}

function PowerAnimalCard({
  name,
  isYou,
  isPending,
  totalValue,
  personality,
  milestone,
  onOpen,
}: {
  name: string;
  isYou: boolean;
  isPending: boolean;
  totalValue: number;
  personality: PortfolioPersonality | null;
  milestone: { next: number | null; progress: number };
  onOpen: () => void;
}) {
  const tone = animalCardTone(personality?.archetype.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 pl-5 text-left transition hover:brightness-110",
        tone.border,
        tone.wash
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1.5", tone.bar)}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl",
            tone.well
          )}
          aria-hidden
        >
          {personality?.animalEmoji ?? "❔"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {name}
                {isYou && (
                  <span className="ml-1.5 text-xs font-normal text-zinc-400">
                    (you)
                  </span>
                )}
                {isPending && (
                  <span className="ml-1.5 text-xs font-normal text-amber-500/90">
                    awaiting sign-in
                  </span>
                )}
              </p>
              <p className={cn("mt-0.5 text-base font-semibold", tone.name)}>
                {personality?.animal ?? "No book yet"}
              </p>
            </div>
            <p className="shrink-0 text-base font-semibold tabular-nums text-white">
              {currency(totalValue, 0)}
            </p>
          </div>
        </div>
      </div>

      {personality && (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-relaxed text-zinc-300">
            {personality.whyThisAnimal}
          </p>
          <div className="space-y-1 text-xs leading-relaxed">
            <p className="flex gap-1.5 text-emerald-300/90">
              <Shield className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{personality.archetype.strength}</span>
            </p>
            <p className="flex gap-1.5 text-amber-300/90">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{personality.archetype.watchFor}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-black/25 px-2 py-1 text-xs tabular-nums text-zinc-300">
              Spread {Math.round(personality.diversificationScore)}
            </span>
            <span className="rounded-md bg-black/25 px-2 py-1 text-xs tabular-nums text-zinc-300">
              Risk {Math.round(personality.riskScore)}
            </span>
            <span className="rounded-md bg-black/25 px-2 py-1 text-xs tabular-nums text-zinc-300">
              {personality.topTicker
                ? `${cashtag(personality.topTicker)} ${personality.convictionScore}%`
                : `Conviction ${personality.convictionScore}%`}
            </span>
          </div>

          <p className="text-xs text-zinc-400">
            <span className="tabular-nums text-zinc-200">
              {personality.expectedAnnualReturnPct.toFixed(1)}%
            </span>{" "}
            a year
            <span className="mx-1.5 text-zinc-600">·</span>
            <span className="tabular-nums text-loss">
              {personality.maxDrawdownPct}%
            </span>{" "}
            stretch
            <span className="mx-1.5 text-zinc-600">·</span>
            <span
              className={cn(
                "tabular-nums",
                signedTone(personality.modeledAlphaPct, "text-zinc-200")
              )}
            >
              {signedPctPoints(personality.modeledAlphaPct)}
            </span>{" "}
            vs index
          </p>

          {milestone.next != null && (
            <div>
              <div className="flex items-baseline justify-between gap-2 text-xs text-zinc-400">
                <span>
                  Next{" "}
                  <span className="font-medium text-zinc-300">
                    {currency(milestone.next, 0)}
                  </span>
                </span>
                <span className="tabular-nums">
                  {Math.round(milestone.progress * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/30">
                <div
                  className={cn("h-full rounded-full", tone.milestone)}
                  style={{
                    width: `${Math.round(milestone.progress * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </button>
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
      <div className="text-xs text-zinc-400">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "up" && "text-gain",
          tone === "down" && "text-loss",
          !tone && "text-white"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-zinc-400">{sub}</div>}
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

  // Biggest position first by default — matches the default sort in My
  // book, and is far more useful at a glance than raw creation order.
  const sortedHoldings = [...holdings].sort(
    (a, b) =>
      (quotes[b.ticker]?.price ?? 0) * b.shares -
      (quotes[a.ticker]?.price ?? 0) * a.shares
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total value" value={currency(totalValue)} />
        <Stat
          label="Today"
          value={signedCurrency(todayDollar)}
          sub={todayPct != null ? percent(todayPct) : undefined}
          tone={todayDollar > 0 ? "up" : todayDollar < 0 ? "down" : undefined}
        />
        <Stat
          label="Gain so far"
          value={signedCurrency(totalPnl)}
          sub={percent(totalRoiPct)}
          tone={totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : undefined}
        />
      </div>
      <div className="space-y-2 md:hidden">
        {sortedHoldings.map((h) => {
          const price = quotes[h.ticker]?.price ?? 0;
          const value = price * h.shares;
          const cost = h.buy_price * h.shares;
          const pnl = value - cost;
          const roiPct = cost > 0 ? pnl / cost : 0;
          const todayPct = quotes[h.ticker]?.changePercent ?? null;
          const pctBook = totalValue > 0 ? value / totalValue : 0;
          return (
            <div
              key={h.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-white">{cashtag(h.ticker)}</p>
                <p className="text-sm tabular-nums text-zinc-100">
                  {currency(value)}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                {percent(pctBook)} of book · {h.shares} sh · {currency(price)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
                <span className={signedTone(todayPct, "text-zinc-400")}>
                  {todayPct != null ? percent(todayPct) : "—"} today
                </span>
                <span className={signedTone(roiPct)}>{percent(roiPct)}</span>
                <span className={signedTone(pnl)}>{signedCurrency(pnl)}</span>
              </div>
            </div>
          );
        })}
        {holdings.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-400">
            No holdings on this sheet.
          </p>
        )}
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-3 text-sm">
          <span className="text-zinc-400">Cash</span>
          <span className="tabular-nums text-zinc-100">{currency(cash)}</span>
        </div>
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 md:block">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-zinc-800 text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium">% Book</th>
              <th className="px-3 py-2 font-medium">Shares</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Today</th>
              <th className="px-3 py-2 font-medium">Cost</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">ROI %</th>
              <th className="px-3 py-2 font-medium">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((h) => {
              const price = quotes[h.ticker]?.price ?? 0;
              const value = price * h.shares;
              const cost = h.buy_price * h.shares;
              const pnl = value - cost;
              const roiPct = cost > 0 ? pnl / cost : 0;
              const todayPct = quotes[h.ticker]?.changePercent ?? null;
              const pctBook = totalValue > 0 ? value / totalValue : 0;
              return (
                <tr key={h.id} className="border-b border-zinc-800/60">
                  <td className="px-3 py-2 font-medium">{cashtag(h.ticker)}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-400">
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
                      signedTone(todayPct, "text-zinc-400")
                    )}
                  >
                    {todayPct != null ? percent(todayPct, 2) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-400">
                    {currency(cost)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{currency(value)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      signedTone(roiPct)
                    )}
                  >
                    {percent(roiPct)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      signedTone(pnl)
                    )}
                  >
                    {signedCurrency(pnl)}
                  </td>
                </tr>
              );
            })}
            {holdings.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-400" colSpan={9}>
                  No holdings on this sheet.
                </td>
              </tr>
            )}
            <tr>
              <td className="px-3 py-2 text-zinc-400" colSpan={6}>
                Cash
              </td>
              <td className="px-3 py-2 tabular-nums" colSpan={3}>
                {currency(cash)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
