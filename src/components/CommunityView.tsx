"use client";

import { ClassroomRoster } from "@/components/ClassroomRoster";
import { ClassTradeBanner } from "@/components/ClassTradeBanner";
import {
  ClassroomPlanEditor,
  planFromCommunity,
} from "@/components/ClassroomPlanEditor";
import { DailyDuelCard } from "@/components/DailyDuelCard";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { ShareSheets } from "@/components/ShareSheets";
import { SignInGate } from "@/components/SignInGate";
import { BookBottomNav } from "@/components/BookBottomNav";
import { AppHeader } from "@/components/AppHeader";
import { MobileChrome } from "@/components/mobile/MobileChrome";
import { track } from "@vercel/analytics";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { StartingCashField } from "@/components/StartingCashField";
import {
  DEFAULT_STARTING_CASH,
  parseStartingCash,
  type ClassPeriodKind,
  type ClassPlan,
  type ClassroomTrade,
  type ThesisCoverage,
} from "@/lib/classroom";
import { currency, percent, signedCurrency, signedPercent, cn, cashtag, signedTone } from "@/lib/format";
import { listingCurrency } from "@/lib/listing-currency";
import { TickerSymbol } from "@/components/TickerSymbol";
import { Card, Score, Scoreboard } from "@/components/ui/Panel";
import { combineHouseholdNames } from "@/lib/auth/identity";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { plainError } from "@/lib/plain-error";
import { circleWeekBoard, recordCircleSession } from "@/lib/circle-board";
import { overlapRows } from "@/lib/circle-overlap";
import { sheetCashBalance } from "@/lib/cash-balance";
import { buildOverview } from "@/lib/overview";
import {
  loadCommunityCache,
  loadCommunityDuelCache,
  saveCommunityCache,
  clearCommunityCache,
  type CommunityDuelCache,
} from "@/lib/community-cache";
import { isWorkspaceRoomActive, saveLastCircleId } from "@/lib/workspace-rooms";
import { currentDuelSessionKey } from "@/lib/daily-duel";
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
  GraduationCap,
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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { quotePollMs, quotesUrl } from "@/lib/market/session";
import { isAbortError, isNetworkError } from "@/lib/abort";
import { useNetworkResume } from "@/lib/use-network-resume";
import {
  inviteDayLabel,
  inviteLockLabel,
  inviteUsesLabel,
  type InviteAdminRow,
} from "@/lib/community-invite-admin";

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
  kind?: "circle" | "classroom";
  starting_cash?: number;
  house_note?: string | null;
  class_plan?: unknown;
  classTrade?: ClassroomTrade | null;
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
  thesisCoverage?: Record<string, ThesisCoverage>;
};

/** Synchronous cache read shared by every piece of state below, so they
 * all hydrate from the exact same snapshot instead of some fields lagging
 * a render behind others. */
type CommunityCache = {
  meta: CommunityMetaResponse | null;
  book: CommunityBookResponse | null;
};

function readCommunityCache(communityId: string): CommunityCache {
  const cached = loadCommunityCache(communityId);
  if (!cached) return { meta: null, book: null };
  return {
    meta: (cached.meta as CommunityMetaResponse) ?? null,
    book: (cached.book as CommunityBookResponse) ?? null,
  };
}

export function CommunityView({ communityId }: Props) {
  const router = useRouter();
  // /communities/[id] sits behind no auth gate, so this component really is
  // server-rendered and then hydrated. Every one of these used to be seeded
  // straight out of localStorage (and out of window.location) during render,
  // which meant the server tree and the first client tree disagreed on
  // basically all of it: React discarded the server HTML and re-rendered the
  // whole page, so the cache that existed to make this instant was making it
  // slower. State now starts at the server-safe value and the cache is applied
  // in a layout effect below, before the browser paints.
  const initialCacheRef = useRef<CommunityCache>({ meta: null, book: null });
  const [community, setCommunity] = useState<CommunityMeta | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinDecisionBusyId, setJoinDecisionBusyId] = useState<string | null>(
    null
  );
  const [portfolios, setPortfolios] = useState<OwnedPortfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ownership, setOwnership] = useState<
    { portfolio_id: string; user_id: string }[]
  >([]);
  const [thesisCoverage, setThesisCoverage] = useState<
    Record<string, ThesisCoverage>
  >({});
  const [claimBusy, setClaimBusy] = useState(false);
  // Community books paint instantly from cache, so without seeding prices
  // too every member's value would render at cost basis for a beat.
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  // Only true when we have nothing at all to show yet — a cache hit
  // (even a stale one) renders immediately while load() quietly confirms
  // it's current in the background, instead of blanking the page on
  // every single visit the way an unconditional loading flag would.
  const [loading, setLoading] = useState(true);
  const [duelCache, setDuelCache] = useState<CommunityDuelCache | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(
    null
  );
  const [view, setView] = useState<"overview" | "play" | "members">("overview");
  const hasDataRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const fromPopRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const correctingRef = useRef(false);

  useLayoutEffect(() => {
    const cache = readCommunityCache(communityId);
    initialCacheRef.current = cache;

    // Assigned unconditionally, including the empty case. React can keep this
    // component mounted across a move from one community to another, and
    // leaving the previous one's rows on screen while the new one loads would
    // show a person someone else's book under the wrong name.
    setCommunity(cache.meta?.community ?? null);
    if (cache.meta?.community) saveLastCircleId(communityId);
    setMembers(cache.meta?.members ?? []);
    setPendingMembers(cache.meta?.pending_members ?? []);
    setIsAdmin(cache.meta?.isAdmin ?? false);
    setJoinRequests(cache.meta?.join_requests ?? []);
    setPortfolios(cache.book?.portfolios ?? []);
    setHoldings(cache.book?.holdings ?? []);
    setProfiles(cache.book?.profiles ?? []);
    setOwnership(cache.book?.ownership ?? []);
    setThesisCoverage(cache.book?.thesisCoverage ?? {});
    setQuotes(loadCachedQuotes().quotes);
    setDuelCache(loadCommunityDuelCache(communityId, currentDuelSessionKey()));
    hasDataRef.current = Boolean(cache.meta);
    setLoading(!cache.meta);
    bootstrappedRef.current = false;
    fromPopRef.current = false;

    const params = new URLSearchParams(window.location.search);
    setSelectedOwnerId(params.get("member"));
    setSelectedPortfolioId(params.get("portfolio"));
    const rawView = params.get("view");
    if (rawView === "members") setView("members");
    else if (rawView === "play" || rawView === "league") setView("play");
    else setView("overview");
  }, [communityId]);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsNote, setSettingsNote] = useState("");
  const [settingsStartingCash, setSettingsStartingCash] = useState(
    DEFAULT_STARTING_CASH
  );
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmailed, setInviteEmailed] = useState(0);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDays, setInviteDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [invites, setInvites] = useState<InviteAdminRow[]>([]);
  const [retireTarget, setRetireTarget] = useState<InviteAdminRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  // Tracks whether we have SOME data already (from cache or a prior
  // successful load) — a ref so `load` doesn't need `community` etc. in
  // its own dependency array just to decide whether to show a spinner.
  // Mount + visibility-regain can both trigger `load()` in quick succession
  // (e.g. flip tabs away and back before the first request lands). Without
  // this, whichever request happens to resolve last wins, even if it was
  // the older/stale one — a classic out-of-order response race. Only the
  // most-recently-started call is allowed to commit state.
  const loadCallIdRef = useRef(0);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    const callId = ++loadCallIdRef.current;
    const isBackgroundRefresh = hasDataRef.current;
    if (!isBackgroundRefresh) setLoading(true);
    if (!isBackgroundRefresh) setError(null);
    try {
      const [metaRes, bookRes] = await Promise.all([
        fetch(`/api/communities/${communityId}`, {
          cache: "no-store",
          signal: ctrl.signal,
        }),
        fetch(`/api/communities/${communityId}/book`, {
          cache: "no-store",
          signal: ctrl.signal,
        }),
      ]);
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        throw new Error(
          plainError((err as { error?: string }).error, "Couldn't load this circle.")
        );
      }
      if (!bookRes.ok) {
        const err = await bookRes.json().catch(() => ({}));
        throw new Error(
          plainError((err as { error?: string }).error, "Couldn't load this circle's portfolios.")
        );
      }
      const meta = await metaRes.json();
      const book = await bookRes.json();
      if (callId !== loadCallIdRef.current) return;
      setCommunity(meta.community);
      saveLastCircleId(communityId);
      setMembers(meta.members ?? []);
      setPendingMembers(meta.pending_members ?? []);
      setIsAdmin(Boolean(meta.isAdmin));
      setJoinRequests(meta.join_requests ?? []);
      setPortfolios(book.portfolios ?? []);
      setHoldings(book.holdings ?? []);
      setProfiles(book.profiles ?? []);
      setOwnership(book.ownership ?? []);
      setThesisCoverage(book.thesisCoverage ?? {});
      hasDataRef.current = true;
      saveCommunityCache(communityId, { meta, book });
    } catch (e) {
      if (isAbortError(e) || callId !== loadCallIdRef.current) return;
      // A background refresh failing behind already-visible cached
      // content shouldn't slap an error over it — only surface the error
      // when there was nothing on screen to begin with.
      if (!isBackgroundRefresh) {
        setError(
          isNetworkError(e)
            ? "You look offline. Showing this circle when the connection is back."
            : e instanceof Error
              ? e.message
              : "Couldn't load this circle."
        );
      }
    } finally {
      if (callId === loadCallIdRef.current) setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void load();
    return () => {
      loadAbortRef.current?.abort();
      loadCallIdRef.current += 1;
    };
  }, [load]);

  useNetworkResume(() => {
    void load();
  });

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
  useEffect(() => {
    function onPopState() {
      fromPopRef.current = true;
      const params = new URLSearchParams(window.location.search);
      setSelectedOwnerId(params.get("member"));
      setSelectedPortfolioId(params.get("portfolio"));
      const raw = params.get("view");
      setView(
        raw === "members"
          ? raw
          : raw === "play" || raw === "league"
            ? "play"
            : "overview"
      );
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith(`/communities/${communityId}`)) {
      return;
    }
    const url = new URL(window.location.href);
    if (selectedOwnerId) url.searchParams.set("member", selectedOwnerId);
    else url.searchParams.delete("member");
    if (selectedPortfolioId) url.searchParams.set("portfolio", selectedPortfolioId);
    else url.searchParams.delete("portfolio");
    if (view === "members") url.searchParams.set("view", view);
    else if (view === "play") url.searchParams.set("view", "league");
    else url.searchParams.delete("view");
    const href = `${url.pathname}${url.search}`;

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      window.history.replaceState(window.history.state, "", href);
      return;
    }
    if (fromPopRef.current) {
      fromPopRef.current = false;
      window.history.replaceState(window.history.state, "", href);
      return;
    }
    if (correctingRef.current) {
      correctingRef.current = false;
      window.history.replaceState(window.history.state, "", href);
      return;
    }
    window.history.pushState(window.history.state, "", href);
  }, [communityId, selectedOwnerId, selectedPortfolioId, view]);

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
      correctingRef.current = true;
      setSelectedOwnerId(null);
      setSelectedPortfolioId(null);
    }
  }, [loading, selectedOwnerId, members, pendingMembers]);

  useEffect(() => {
    if (loading || !selectedPortfolioId) return;
    if (!portfolios.some((p) => p.id === selectedPortfolioId)) {
      correctingRef.current = true;
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
    const ctrl = new AbortController();
    const tick = async () => {
      if (cancelled || document.hidden) return;
      if (!isWorkspaceRoomActive(`community:${communityId}`)) return;
      try {
        const res = await fetch(quotesUrl(tickers), { signal: ctrl.signal });
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
      ctrl.abort();
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
    /** Always 0 in community. Cost is not shared. */
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
      const previousTotal = totalValue - todayDollar;
      const todayPct = previousTotal > 0 ? todayDollar / previousTotal : null;
      const cash = sheets.reduce((s, p) => s + sheetCashBalance(p), 0);
      const tickerValues = holdings
        .filter((h) => sheetIds.has(h.portfolio_id))
        .map((h) => ({
          ticker: h.ticker,
          value: h.shares * (quotes[h.ticker]?.price ?? 0),
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
        roiPct: 0,
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

  const isClassroom = community?.kind === "classroom";
  const startingCash = Number(community?.starting_cash) || DEFAULT_STARTING_CASH;
  const classStartTotal =
    startingCash * Math.max(1, membersWithBooks.length);
  const classVsStartDollar = overview.totals.totalValue - classStartTotal;
  const classVsStartPct =
    classStartTotal > 0 ? classVsStartDollar / classStartTotal : null;
  const myMember = members.find((m) => m.is_you);
  const myClassSheet = Boolean(
    isClassroom &&
      myMember &&
      portfolios.some(
        (p) =>
          p.classroom_community_id === communityId &&
          ownership.some(
            (o) => o.portfolio_id === p.id && o.user_id === myMember.user_id
          )
      )
  );
  const effectiveView = isClassroom && view === "play" ? "overview" : view;

  async function claimClassSheet() {
    setClaimBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}/classroom-sheet`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError((data as { error?: string }).error, "Couldn't make the paper portfolio.")
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the paper portfolio.");
    } finally {
      setClaimBusy(false);
    }
  }

  const sharedNames = useMemo(
    () =>
      overlapRows(overview.tickers, (portfolioIds) => {
        const names = new Set<string>();
        for (const pid of portfolioIds) {
          for (const o of ownership.filter((x) => x.portfolio_id === pid)) {
            names.add(profileName(o.user_id));
          }
        }
        return [...names];
      }),
    [overview.tickers, ownership, profileName]
  );

  const [leaguePrize, setLeaguePrize] = useState(() =>
    circleWeekBoard(communityId)
  );

  useEffect(() => {
    if (membersWithBooks.length < 2) return;
    const winner = [...membersWithBooks].sort(
      (a, b) => (b.todayPct ?? -1) - (a.todayPct ?? -1)
    )[0];
    if (!winner || winner.todayPct == null) return;
    recordCircleSession(communityId, winner.name);
    setLeaguePrize(circleWeekBoard(communityId));
  }, [communityId, membersWithBooks]);

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
      title: "Most spread out",
      winner: mostDiversified.name,
      stat: `${mostDiversified.personality!.diversificationScore}/100`,
      description: "Most spread-out portfolio in the circle.",
    });

    const mostRisk = [...withPersonality].sort(
      (a, b) => b.personality!.riskScore - a.personality!.riskScore
    )[0]!;
    out.push({
      id: "risk-taker",
      emoji: "🔥",
      title: "Hottest portfolio",
      winner: mostRisk.name,
      stat: `${mostRisk.personality!.riskScore}/100`,
      description: "The jumpiest mix of names in the circle.",
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
      description: "Calmest portfolio in the circle.",
    });

    const mostConviction = [...withPersonality].sort(
      (a, b) => b.personality!.convictionScore - a.personality!.convictionScore
    )[0]!;
    if (mostConviction.personality!.convictionScore >= 30) {
      out.push({
        id: "conviction",
        emoji: "🎯",
        title: "Biggest bet",
        winner: mostConviction.name,
        stat: `${mostConviction.personality!.convictionScore}%${
          mostConviction.personality!.topTicker
            ? ` ${cashtag(mostConviction.personality!.topTicker)}`
            : ""
        }`,
        description: "Biggest single name relative to the rest of the portfolio.",
      });
    }

    const mostThemes = [...withPersonality].sort(
      (a, b) => b.personality!.themeCount - a.personality!.themeCount
    )[0]!;
    if (mostThemes.personality!.themeCount >= 2) {
      out.push({
        id: "themes",
        emoji: "🗺️",
        title: "Most kinds of stocks",
        winner: mostThemes.name,
        stat: `${mostThemes.personality!.themeCount} groups`,
        description: "Holds the most different kinds of businesses.",
      });
    }

    const mostCash = [...withPersonality].sort(
      (a, b) => b.personality!.cashPct - a.personality!.cashPct
    )[0]!;
    if (mostCash.personality!.cashPct >= 8) {
      out.push({
        id: "dry-powder",
        emoji: "💧",
        title: "Most cash",
        winner: mostCash.name,
        stat: `${mostCash.personality!.cashPct}% cash`,
        description: "Largest cash stash relative to the portfolio.",
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
        emoji: "⬡",
        title: "One-kind diet",
        winner: mostSpecialist.name,
        stat: `${mostSpecialist.personality!.specialistScore}%`,
        description: "Heaviest bet on one kind of business.",
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
        title: "Largest portfolio",
        winner: biggestBook.name,
        stat: currency(biggestBook.totalValue, 0),
        description: "Largest portfolio in the circle.",
      });
      out.push({
        id: "small-mighty",
        emoji: "🌱",
        title: "Small but Mighty",
        winner: smallestBook.name,
        stat: currency(smallestBook.totalValue, 0),
        description: "Smallest portfolio. Every circle has a sapling.",
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
   * pooled, so a ticker held in two of them collapses into one row.
   * Picking a single book skips the merge. Cost is never shown here.
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
      });
    }
    return [...byTicker.values()];
  }, [selectedPortfolioId, ownerPortfolios, holdings]);

  const selectedCash = selectedPortfolio
    ? sheetCashBalance(selectedPortfolio)
    : ownerPortfolios.reduce((s, p) => s + sheetCashBalance(p), 0);

  const loadInvites = useCallback(async () => {
    const res = await fetch(`/api/communities/${communityId}/invites`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as {
      invites?: InviteAdminRow[];
    };
    setInvites(Array.isArray(data.invites) ? data.invites : []);
  }, [communityId]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadInvites();
  }, [isAdmin, loadInvites]);

  async function createInvite() {
    setBusy(true);
    setInviteUrl(null);
    setInviteEmailed(0);
    try {
      const days = Math.floor(Number(inviteDays.trim()));
      const res = await fetch(`/api/communities/${communityId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim() || undefined,
          ...(Number.isFinite(days) && days >= 1 ? { daysValid: days } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't send that invite."));
      track("community_invite_created");
      const url = `${window.location.origin}${data.path}`;
      setInviteUrl(url);
      setInviteEmailed(
        typeof data.emailed === "number" && data.emailed > 0 ? data.emailed : 0
      );
      await navigator.clipboard.writeText(url).catch(() => undefined);
      await loadInvites();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that invite.");
    } finally {
      setBusy(false);
    }
  }

  async function retireInvite(inviteId: string) {
    const res = await fetch(
      `/api/communities/${communityId}/invites/${inviteId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: true }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(plainError(data.error, "Couldn't retire that link."));
    }
    await loadInvites();
    return true;
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
        throw new Error(plainError((data as { error?: string }).error, "Couldn't remove that person."));
      }
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that person.");
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
          plainError((data as { error?: string }).error, "Couldn't change that role.")
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change that role.");
    } finally {
      setBusy(false);
    }
  }

  function openSettings() {
    setSettingsName(community?.name ?? "");
    setSettingsNote(community?.house_note ?? "");
    setSettingsStartingCash(
      Number(community?.starting_cash) || DEFAULT_STARTING_CASH
    );
    setSettingsError(null);
    setSettingsOpen(true);
  }

  async function handleSaveHouseNote() {
    const note = settingsNote.trim();
    if (note === (community?.house_note ?? "").trim()) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseNote: note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(plainError((data as { error?: string }).error, "Couldn't save that note."));
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't save that note.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleStartPeriod(kind: ClassPeriodKind) {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPeriod: kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError((data as { error?: string }).error, "Couldn't change that.")
        );
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't change that.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleSaveClassPlan(plan: ClassPlan) {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classPlan: plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError((data as { error?: string }).error, "Couldn't save the schedule.")
        );
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(
        e instanceof Error ? e.message : "Couldn't save the schedule."
      );
    } finally {
      setSettingsBusy(false);
    }
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
        throw new Error(plainError((data as { error?: string }).error, "Couldn't rename this circle."));
      }
      setCommunity((data as { community: CommunityMeta }).community);
      setSettingsOpen(false);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't rename this circle.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleSaveStartingCash() {
    const next = parseStartingCash(settingsStartingCash);
    const current = Number(community?.starting_cash) || DEFAULT_STARTING_CASH;
    if (next == null || next === current) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingCash: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError(
            (data as { error?: string }).error,
            "Couldn't update starting cash."
          )
        );
      }
      setCommunity((data as { community: CommunityMeta }).community);
      void load();
    } catch (e) {
      setSettingsError(
        e instanceof Error ? e.message : "Couldn't update starting cash."
      );
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
        throw new Error(plainError((data as { error?: string }).error, "Couldn't update that."));
      }
      setCommunity((data as { community: CommunityMeta }).community);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Couldn't update that.");
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
        throw new Error(plainError((data as { error?: string }).error, "Couldn't save that decision."));
      }
      setJoinRequests((rows) => rows.filter((r) => r.user_id !== userId));
      if (decision === "approve") await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that decision.");
    } finally {
      setJoinDecisionBusyId(null);
    }
  }

  async function handleLeaveCommunity() {
    const me = members.find((m) => m.is_you);
    if (!me) throw new Error("Couldn't tell which member you are. Try again.");
    const res = await fetch(
      `/api/communities/${communityId}/members/${me.user_id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(plainError((data as { error?: string }).error, "Couldn't leave this circle."));
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
      throw new Error(plainError((data as { error?: string }).error, "Couldn't delete this circle."));
    }
    clearCommunityCache(communityId);
    router.push("/communities");
    return true;
  }

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileChrome
          title={community?.name ?? "Community"}
          active="circle"
          end={
            isAdmin && community ? (
              <button
                type="button"
                onClick={openSettings}
                title="Community settings"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 hover:bg-hover hover:text-foreground"
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
                    community.kind === "classroom"
                      ? "Paper class"
                      : community.visibility === "public"
                        ? "Public community"
                        : "Private community"
                  }
                >
                  {community.kind === "classroom" ? (
                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-brand-bright/80" />
                  ) : community.visibility === "public" ? (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-brand-bright" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
                  )}
                </span>
              )}
            </span>
          }
        >
          {isAdmin && joinRequests.length > 0 && (
            <span
              title={`${joinRequests.length} pending join request${joinRequests.length === 1 ? "" : "s"}`}
              className="shrink-0 rounded-lg bg-select px-2 py-0.5 text-sm font-semibold text-select-ink"
            >
              {joinRequests.length}
            </span>
          )}
          {isAdmin && community && (
            <button
              type="button"
              onClick={openSettings}
              title="Community settings"
              className="touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </AppHeader>

        <main id="main" className={PAGE_MAIN_CLASS}>
          {loading && (
            <p className="text-sm text-muted">Loading community …</p>
          )}
          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {!loading && !selectedOwnerId && (
            <>
              <section className="space-y-3">
                <p className="text-sm text-muted">
                  {isClassroom
                    ? "Paper class. Same starting cash. Ranked by percent vs start."
                    : "Shared portfolios added together. Today's percent is the fair compare, because books are different sizes. Members do not see what you paid."}
                </p>
                {isClassroom &&
                community?.classTrade &&
                (community.classTrade.kind !== "open" ||
                  community.classTrade.until) ? (
                  <ClassTradeBanner
                    trade={community.classTrade}
                    teacherNote={
                      isAdmin
                        ? "You can still edit. Students cannot."
                        : undefined
                    }
                  />
                ) : community?.house_note?.trim() ? (
                  <p className="text-sm leading-relaxed text-foreground">
                    {community.house_note.trim()}
                  </p>
                ) : null}
                {isClassroom && !myClassSheet ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
                    <p className="min-w-0 flex-1 text-sm text-foreground/80">
                      {isAdmin
                        ? "You are watching the class. Get a paper portfolio if you want to trade alongside them."
                        : "Your paper portfolio is not on Home yet. Same starting cash as everyone else."}
                    </p>
                    <button
                      type="button"
                      disabled={claimBusy}
                      onClick={() => void claimClassSheet()}
                      className="btn-primary shrink-0 disabled:opacity-50"
                    >
                      {claimBusy ? "Making portfolio …" : "Get paper portfolio"}
                    </button>
                  </div>
                ) : null}
                {isClassroom && myClassSheet ? (
                  <p className="text-sm text-muted">
                    Your paper portfolio is on Home. Sunday note is the weekly recap.
                  </p>
                ) : null}
                <Scoreboard cols={3}>
                  <Score
                    label="Today"
                    value={
                      overview.totals.todayPct != null
                        ? signedPercent(overview.totals.todayPct)
                        : "—"
                    }
                    sub={signedCurrency(overview.totals.todayDollar)}
                    tone={
                      (overview.totals.todayPct ?? 0) > 0
                        ? "up"
                        : (overview.totals.todayPct ?? 0) < 0
                          ? "down"
                          : undefined
                    }
                  />
                  <Score
                    label="Total value"
                    value={currency(overview.totals.totalValue)}
                  />
                  {isClassroom ? (
                    <Score
                      label="vs start"
                      value={
                        classVsStartPct != null
                          ? signedPercent(classVsStartPct)
                          : "—"
                      }
                      sub={`${signedCurrency(classVsStartDollar)} · ${currency(startingCash)} each`}
                      tone={
                        (classVsStartPct ?? 0) > 0
                          ? "up"
                          : (classVsStartPct ?? 0) < 0
                            ? "down"
                            : undefined
                      }
                    />
                  ) : (
                    <Score
                      label="Cash"
                      value={currency(overview.totals.cash)}
                      tone={overview.totals.cash < 0 ? "down" : undefined}
                    />
                  )}
                </Scoreboard>
              </section>

              <div className="flex gap-1 rounded-lg border border-border bg-well/50 p-1 w-fit">
                {(
                  (isClassroom
                    ? [
                        ["overview", "Roster", LayoutGrid],
                        ["members", "Members", Users],
                      ]
                    : [
                        ["overview", "Overview", LayoutGrid],
                        ["play", "League", Award],
                        ["members", "Members", Users],
                      ]) as ReadonlyArray<
                    [typeof view, string, typeof LayoutGrid]
                  >
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                      view === id
                        ? "bg-select text-select-ink"
                        : "text-muted hover:bg-hover hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {(effectiveView === "overview" || effectiveView === "play") && (
                <div className="flex flex-col gap-5">
                  {effectiveView === "overview" && isClassroom && (
                    <WidgetErrorBoundary name="Class roster" resetKey={communityId}>
                    <ClassroomRoster
                      members={memberStats.map((m) => ({
                        id: m.id,
                        name: m.name,
                        isYou: m.isYou,
                        sheetCount: m.sheetCount,
                        totalValue: m.totalValue,
                        todayDollar: m.todayDollar,
                        todayPct: m.todayPct,
                        topTicker: m.personality?.topTicker ?? null,
                        topWeight: m.personality?.convictionScore ?? null,
                      }))}
                      startingCash={startingCash}
                      holdings={holdings}
                      quotes={quotes}
                      ownership={ownership}
                      thesisCoverage={thesisCoverage}
                      onOpen={(id) => {
                        setSelectedOwnerId(id);
                        setSelectedPortfolioId(null);
                      }}
                    />
                    </WidgetErrorBoundary>
                  )}
                  {effectiveView === "overview" &&
                    !isClassroom &&
                    membersWithBooks.length === 0 && (
                    <p className="text-sm text-muted">
                      Nobody has shared a portfolio here yet. Pick which of
                      yours belong in this circle.
                    </p>
                  )}
                  {effectiveView === "overview" &&
                    isClassroom &&
                    membersWithBooks.length === 0 &&
                    isAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted">
                        Send the invite. Each student gets the same starting
                        cash and an empty portfolio.
                      </p>
                      <button
                        type="button"
                        onClick={() => setView("members")}
                        className="text-sm font-medium text-brand-bright hover:text-foreground"
                      >
                        Invite students
                      </button>
                    </div>
                  )}
                  {effectiveView === "overview" &&
                    !isClassroom &&
                    membersWithBooks.length > 0 && (
                    <WidgetErrorBoundary name="Daily Duel" resetKey={communityId}>
                    <DailyDuelCard
                      compact
                      communityId={communityId}
                      initialDuel={duelCache}
                      tickers={overview.tickers.map((t) => ({
                        ticker: t.ticker,
                        todayPct: t.todayPct,
                      }))}
                    />
                    </WidgetErrorBoundary>
                  )}
                  {effectiveView === "play" && leaguePrize && leaguePrize.wins >= 1 && (
                    <p className="text-sm text-foreground/80">
                      {leaguePrize.name} took {leaguePrize.wins}{" "}
                      {leaguePrize.wins === 1 ? "session" : "sessions"} this
                      week.
                    </p>
                  )}
                  {effectiveView === "play" && membersWithBooks.length > 0 && (
                    <section className="overview-fade order-3 rounded-2xl border border-border bg-card p-5">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-foreground">
                              Power animals
                            </h3>
                            <p className="mt-0.5 text-sm text-muted">
                              How each portfolio is built. Tap someone to open their
                              portfolios.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBestiaryOpen(true)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-well/60 px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:border-brand/40 hover:text-foreground"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Field guide</span>
                        </button>
                      </div>
                      <div className="grid gap-6 lg:grid-cols-2 lg:gap-y-5">
                        {membersWithBooks.map((m) => (
                          <PowerAnimalCard
                            key={m.id}
                            name={m.name}
                            isYou={m.isYou}
                            isPending={m.isPending}
                            totalValue={m.totalValue}
                            todayPct={m.todayPct}
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

                  {effectiveView === "play" && achievements.length > 0 && (
                    <section className="overview-fade order-2 rounded-2xl border border-border bg-card p-5">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="rounded-xl bg-pink-500/15 p-2 text-pink-300">
                          <Award className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Community superlatives
                          </h3>
                          <p className="mt-0.5 text-sm text-muted">
                            Fun awards pulled from the numbers above
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {achievements.map((a) => (
                          <div
                            key={a.id}
                            className="flex h-full flex-col rounded-xl border border-border bg-raised p-3.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xl" aria-hidden>
                                {a.emoji}
                              </span>
                              <p className="text-sm font-semibold text-foreground">
                                {a.title}
                              </p>
                            </div>
                            <p className="mt-1.5 truncate text-sm font-medium text-brand-bright">
                              {a.winner}{" "}
                              <span className="font-normal text-muted">
                                · {a.stat}
                              </span>
                            </p>
                            <p className="mt-auto pt-1 text-xs leading-relaxed text-muted">
                              {a.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {effectiveView === "overview" && membersWithBooks.length > 0 && (
                    <section className="overview-fade order-1 rounded-2xl border border-border bg-card p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
                            <Trophy className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-foreground">
                              Today
                            </h3>
                            <p className="mt-0.5 text-sm text-muted">
                              Ranked by today&apos;s percent, not dollar size
                            </p>
                          </div>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {[...membersWithBooks]
                          .sort(
                            (a, b) => (b.todayPct ?? -1) - (a.todayPct ?? -1)
                          )
                          .map((m, i) => {
                            const pct = m.todayPct;
                            return (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOwnerId(m.id);
                                    setSelectedPortfolioId(null);
                                  }}
                                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-raised px-3.5 py-2.5 text-left transition hover:border-brand/40 hover:bg-hover"
                                >
                                <span className="w-6 shrink-0 text-center">
                                  {i === 0 ? (
                                    <Medal className="mx-auto h-4 w-4 text-caution" />
                                  ) : i === 1 ? (
                                    <Medal className="mx-auto h-4 w-4 text-muted" />
                                  ) : i === 2 ? (
                                    <Medal className="mx-auto h-4 w-4 text-caution" />
                                  ) : (
                                    <span className="text-xs text-muted">
                                      {i + 1}
                                    </span>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                  {m.name}
                                  {m.isYou && (
                                    <span className="ml-1.5 text-xs text-muted">
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
                                    signedTone(pct, "text-muted")
                                  )}
                                >
                                  {pct != null ? percent(pct) : "—"}
                                </span>
                                <span
                                  className={cn(
                                    "hidden w-24 shrink-0 text-right text-xs tabular-nums sm:inline-block",
                                    signedTone(m.todayDollar, "text-muted")
                                  )}
                                >
                                  {signedCurrency(m.todayDollar, 0)}
                                </span>
                                </button>
                              </li>
                            );
                          })}
                      </ul>
                    </section>
                  )}

                  {effectiveView === "overview" && !isClassroom && sharedNames.length > 0 && (
                    <section className="overview-fade order-4 rounded-2xl border border-border bg-card p-5">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="rounded-xl bg-gain/15 p-2 text-gain">
                          <Layers className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Shared names
                          </h3>
                          <p className="mt-0.5 text-sm text-muted">
                            Who else is in the same name today
                          </p>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {sharedNames.map((row) => (
                          <li
                            key={row.ticker}
                            className="rounded-xl border border-border bg-raised px-4 py-3"
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-heading text-base font-bold text-foreground">
                                {cashtag(row.ticker)}
                              </span>
                              <span
                                className={cn(
                                  "text-sm font-semibold tabular-nums",
                                  signedTone(row.todayPct, "text-muted")
                                )}
                              >
                                {row.todayPct != null
                                  ? signedPercent(row.todayPct)
                                  : "—"}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {row.people.map((name) => (
                                <span
                                  key={name}
                                  className="rounded-lg border border-border bg-well/50 px-2 py-1 text-xs text-foreground/80"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {effectiveView === "play" && communityThemeBreakdown.length > 0 && (
                    <section className="overview-fade order-5 rounded-2xl border border-border bg-card p-5">
                      <div className="mb-5 flex items-center gap-2.5">
                        <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
                          <PieChart className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            What the circle owns
                          </h3>
                          <p className="mt-0.5 text-sm text-muted">
                            Everyone&apos;s holdings pooled by kind of
                            business. How the circle is built, not a
                            recommendation.
                          </p>
                        </div>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-well">
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
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-raised px-3 py-2.5"
                          >
                            <span className="flex items-center gap-2 text-sm text-foreground/80">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: THEME_COLOR[t.theme] }}
                              />
                              {t.label}
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">
                              {Math.round(t.pct * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {effectiveView === "play" && (
                  <section className="overview-fade order-6 rounded-2xl border border-border bg-card p-5">
                    <div className="mb-5 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
                          <Lightbulb className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Community fun facts
                          </h3>
                          <p className="mt-0.5 text-sm text-muted">
                            {funFactsShuffle > 0
                              ? "Shuffled, reload for the daily batch"
                              : "New batch every day"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFunFactsShuffle((n) => n + 1)}
                        className="touch-target inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/40 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-brand hover:bg-hover active:scale-95"
                        title="Get a fresh random batch"
                      >
                        <Shuffle className="h-3.5 w-3.5" />
                        Shuffle
                      </button>
                    </div>
                    <ul className="space-y-3">
                      {communityFunFacts.length === 0 ? (
                        <li className="text-sm text-muted">
                          Not enough data yet. Check back once portfolios load.
                        </li>
                      ) : (
                        communityFunFacts.map((fact, i) => (
                          <li
                            key={`${i}-${fact.slice(0, 24)}`}
                            className="rounded-2xl border border-border/70 bg-raised px-4 py-3.5 text-sm leading-relaxed text-foreground"
                          >
                            {fact}
                          </li>
                        ))
                      )}
                    </ul>
                  </section>
                  )}
                </div>
              )}

              {!isClassroom && (
                <div
                  className={
                    effectiveView === "members" ||
                    (effectiveView === "overview" &&
                      membersWithBooks.length === 0)
                      ? undefined
                      : "hidden"
                  }
                >
                  <ShareSheets
                    communityId={communityId}
                    onChanged={() => void load()}
                  />
                </div>
              )}

              {effectiveView === "members" && (
                <>
                  <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Users className="h-4 w-4 text-muted" />
                      Members
                    </h2>
                    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
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
                        const sheetTodayPct = bookTodayPct(sheetValue, sheetToday);
                        const memberCash = sheets.reduce(
                          (sum, p) => sum + sheetCashBalance(p),
                          0
                        );
                        const memberTickerValues = holdings
                          .filter((h) => sheetIds.has(h.portfolio_id))
                          .map((h) => ({
                            ticker: h.ticker,
                            value:
                              h.shares * (quotes[h.ticker]?.price ?? 0),
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
                              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                {profileName(m.user_id)}
                                {m.is_you && (
                                  <span className="text-xs text-muted">
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
                                <div className="text-xs text-muted">
                                  {m.profile.bio}
                                </div>
                              ) : null}
                              {emails.length > 1 ? (
                                <div className="text-xs text-muted">
                                  {emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-xs text-muted">
                                {m.role}
                                {" · "}
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {sheets.length > 0 && (
                                  <>
                                    {" · today "}
                                    <span
                                      className={signedTone(
                                        sheetTodayPct,
                                        "text-muted"
                                      )}
                                    >
                                      {sheetTodayPct != null
                                        ? signedPercent(sheetTodayPct)
                                        : "—"}
                                    </span>
                                  </>
                                )}
                                {" · "}
                                {currency(sheetValue)}
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
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
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
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-red-300"
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
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:border-loss/40 hover:text-loss"
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
                        const sheetTodayPct = bookTodayPct(sheetValue, sheetToday);
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
                              <div className="text-sm font-medium text-foreground">
                                {p.label}
                                <span className="ml-2 text-xs font-normal text-caution">
                                  awaiting sign-in
                                </span>
                              </div>
                              {p.emails.length ? (
                                <div className="text-xs text-muted">
                                  {p.emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-xs text-muted">
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {sheets.length > 0 && (
                                  <>
                                    {" · today "}
                                    <span
                                      className={signedTone(
                                        sheetTodayPct,
                                        "text-muted"
                                      )}
                                    >
                                      {sheetTodayPct != null
                                        ? signedPercent(sheetTodayPct)
                                        : "—"}
                                    </span>
                                  </>
                                )}
                                {" · "}
                                {currency(sheetValue)}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {isAdmin && joinRequests.length > 0 && (
                    <section className="space-y-3 rounded-xl border border-border bg-hover p-4">
                      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <UserCheck className="h-4 w-4 text-foreground/80" />
                        Join requests
                        <span className="rounded-full bg-select px-1.5 py-0.5 text-xs font-semibold text-select-ink">
                          {joinRequests.length}
                        </span>
                      </h2>
                      <p className="text-xs text-muted">
                        This community is public, so anyone can ask to join,
                        but nothing happens until you approve them here.
                      </p>
                      <ul className="space-y-2">
                        {joinRequests.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-raised px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-foreground">
                                {r.profile?.display_name ?? r.profile?.email ?? "Unknown"}
                              </p>
                              <p className="truncate text-xs text-muted">
                                {r.profile?.email}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                type="button"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() => void decideJoinRequest(r.user_id, "approve")}
                                className="btn-primary px-2.5 py-1.5 text-xs disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() => void decideJoinRequest(r.user_id, "reject")}
                                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-hover disabled:opacity-50"
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
                    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                      <h2 className="text-sm font-medium text-foreground">
                        Admin · invite
                      </h2>
                      <p className="text-xs text-muted">
                        {isClassroom
                          ? "This link stays live. Students join with it. Each one gets the same paper cash and an empty portfolio. Put emails if you want us to send the link, and to lock it to those people. Separate them with a comma. Put a number of days only if you want it to die on its own."
                          : "This link stays live. Anyone with it can join. Their portfolios show up here. They can turn one off later. Today's prices only. Put emails if you want us to send the link, and to lock it to those people. Separate them with a comma. Put a number of days only if you want it to die on its own."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          inputMode="email"
                          autoComplete="off"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Emails (optional, comma between)"
                          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-well px-3 py-2 text-sm"
                        />
                        <input
                          type="number"
                          min={1}
                          max={365}
                          inputMode="numeric"
                          value={inviteDays}
                          onChange={(e) => setInviteDays(e.target.value)}
                          placeholder="Days live (optional)"
                          className="w-[9.5rem] rounded-lg border border-border bg-well px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void createInvite()}
                          className="btn-primary"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Create invite link
                        </button>
                      </div>
                      {inviteUrl && (
                        <div className="space-y-2 rounded-lg border border-border bg-raised px-3 py-2">
                          {inviteEmailed > 0 && (
                            <p className="text-xs text-foreground">
                              {inviteEmailed === 1
                                ? "Sent the link to 1 person."
                                : `Sent the link to ${inviteEmailed} people.`}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 break-all text-xs text-foreground">
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
                            className="btn-secondary px-2 py-1 text-xs"
                          >
                            {inviteCopied ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {inviteCopied ? "Copied" : "Copy"}
                          </button>
                          </div>
                        </div>
                      )}
                      {invites.length > 0 && (
                        <ul className="space-y-2">
                          {invites.map((inv) => {
                            const you = members.find((m) => m.is_you);
                            const youIds = you?.user_ids ?? (you ? [you.user_id] : []);
                            const creatorName =
                              inv.created_by && youIds.includes(inv.created_by.id)
                                ? "You"
                                : inv.created_by?.name ?? "Someone";
                            const usedNames = inv.used_by.map((u) => u.name);
                            const usedLine =
                              usedNames.length === 0
                                ? null
                                : usedNames.length <= 4
                                  ? usedNames.join(", ")
                                  : `${usedNames.slice(0, 4).join(", ")} and ${usedNames.length - 4} more`;
                            const statusLabel =
                              inv.status === "retired"
                                ? "Retired"
                                : inv.status === "expired"
                                  ? "Expired"
                                  : "Live";
                            return (
                              <li
                                key={inv.id}
                                className="rounded-lg border border-border bg-raised px-3 py-2.5"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0 space-y-0.5">
                                    <p className="text-sm text-foreground">
                                      {inv.hint ? `Link ···${inv.hint}` : "Invite"}
                                      <span className="text-muted">
                                        {" "}
                                        · {creatorName}
                                      </span>
                                    </p>
                                    <p className="text-xs text-muted">
                                      {inviteLockLabel(inv.email)}
                                      {" · "}
                                      {inviteDayLabel(inv.created_at)}
                                      {" · "}
                                      {inviteUsesLabel(inv.uses)}
                                      {" · "}
                                      {statusLabel}
                                    </p>
                                    {usedLine && (
                                      <p className="text-xs text-foreground/80">
                                        {usedLine}
                                      </p>
                                    )}
                                  </div>
                                  {inv.status === "live" && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => setRetireTarget(inv)}
                                      className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-hover disabled:opacity-50"
                                    >
                                      Retire this link
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
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
                className="touch-target inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to community
              </button>
              <div className="sticky top-24 z-20 space-y-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-sm">
                <p className="text-sm font-semibold text-foreground">
                  Read-only · owned by{" "}
                  {memberStats.find((m) => m.id === selectedOwnerId)?.name ??
                    profileName(selectedOwnerId)}
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  This is their portfolio. You can look, you cannot edit. Nothing
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
                      "touch-target shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                      selectedPortfolioId === null
                        ? "bg-select text-select-ink border-transparent"
                        : "border-border text-muted hover:border-border hover:text-foreground"
                    )}
                  >
                    All portfolios
                    <span className="ml-1.5 text-muted">
                      {ownerPortfolios.length}
                    </span>
                  </button>
                  {ownerPortfolios.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPortfolioId(p.id)}
                      className={cn(
                        "touch-target shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        selectedPortfolioId === p.id
                          ? "bg-select text-select-ink border-transparent"
                          : "border-border text-muted hover:border-border hover:text-foreground"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              <WidgetErrorBoundary
                name="Member portfolio"
                resetKey={selectedOwnerId ?? communityId}
              >
              <ReadOnlyHoldings
                holdings={selectedHoldings}
                quotes={quotes}
                cash={selectedCash}
              />
              </WidgetErrorBoundary>
            </section>
          )}
        </main>
        <BookBottomNav />
      </div>

      <ConfirmModal
        open={Boolean(retireTarget)}
        title="Retire this link?"
        body="New people will not be able to join with it. People already in stay."
        confirmLabel="Retire this link"
        destructive
        onClose={() => setRetireTarget(null)}
        onConfirm={async () => {
          if (!retireTarget) return false;
          return retireInvite(retireTarget.id);
        }}
      />

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove member?"
        body={`Remove ${removeTarget?.name ?? "this member"} from the community? They'll lose read access to everyone else's portfolio and can be re-invited later.`}
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
        body={`You'll stop seeing everyone else's portfolio in ${community?.name ?? "this community"}, and they'll stop seeing yours. Your own portfolios and holdings stay exactly as they are. You can rejoin later with an invite, or by requesting again if it's public.`}
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
        <ViewportOverlay className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative max-h-full w-full max-w-sm overflow-y-auto rounded-t-2xl border border-border bg-well p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">
                Community settings
              </h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="shrink-0 rounded-lg p-3.5 text-muted hover:bg-hover hover:text-foreground sm:p-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block text-xs font-medium text-muted">
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
              className="mt-1.5 w-full rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand disabled:opacity-50"
            />
            {settingsError && (
              <p className="mt-2 text-xs text-loss">{settingsError}</p>
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

            <label className="mt-5 block text-xs font-medium text-muted">
              {isClassroom ? "What we're learning" : "House note"}
            </label>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {isClassroom
                ? "Change this whenever the lesson changes. Students see it at the top."
                : "One paragraph for the room. Public circles show this on Discover too."}
            </p>
            <textarea
              value={settingsNote}
              onChange={(e) => setSettingsNote(e.target.value)}
              maxLength={isClassroom ? 800 : 400}
              rows={3}
              disabled={settingsBusy}
              placeholder={
                isClassroom
                  ? "Week 2: only sell. Write why you sold."
                  : "Family portfolios, today's prices, no advice."
              }
              className="mt-1.5 w-full rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand disabled:opacity-50"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveHouseNote()}
                disabled={
                  settingsBusy ||
                  settingsNote.trim() === (community?.house_note ?? "").trim()
                }
                className="btn-primary disabled:opacity-40"
              >
                {settingsBusy ? "Saving …" : "Save note"}
              </button>
            </div>

            {isClassroom ? (
              <>
                <ClassroomPlanEditor
                  plan={planFromCommunity(community?.class_plan)}
                  trade={community?.classTrade ?? null}
                  busy={settingsBusy}
                  onStart={(kind) => void handleStartPeriod(kind)}
                  onSavePlan={(plan) => void handleSaveClassPlan(plan)}
                />
                <div className="mt-5">
                  <StartingCashField
                    value={settingsStartingCash}
                    onChange={setSettingsStartingCash}
                    disabled={settingsBusy}
                  />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Classes stay invite-only. Changing this adds or takes the
                  difference from every paper portfolio already handed out.
                </p>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSaveStartingCash()}
                    disabled={
                      settingsBusy ||
                      Number(settingsStartingCash) === startingCash
                    }
                    className="btn-primary disabled:opacity-40"
                  >
                    {settingsBusy ? "Saving …" : "Save starting cash"}
                  </button>
                </div>
              </>
            ) : (
            <div className="mt-5 border-t border-border pt-4">
              <label className="block text-xs font-medium text-muted">
                Visibility
              </label>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {community?.visibility === "public"
                  ? "Public: anyone signed in can find this community and ask to join. You still approve every request."
                  : "Private: invite-only. No one can find or join without a link."}
              </p>
              <div className="mt-2 flex gap-1 rounded-lg border border-border bg-well/50 p-1">
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
                        ? "bg-select text-select-ink"
                        : "text-muted hover:bg-hover hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {isAdmin && (
              <div className="mt-6 rounded-xl border border-loss/40 bg-loss/10 p-3.5">
                <p className="text-xs font-semibold text-loss">
                  Danger zone
                </p>
                <p className="mt-1 text-xs leading-relaxed text-loss">
                  Deleting the community removes it for every member. Their
                  own portfolios and holdings are never affected.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setDeleteConfirmOpen(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-loss/40 bg-loss/10 px-3 py-1.5 text-xs font-semibold text-loss hover:bg-loss/15"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete community
                </button>
              </div>
            )}
          </div>
        </ViewportOverlay>
      )}

      {bestiaryOpen && (
        <ViewportOverlay className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setBestiaryOpen(false)}
          />
          <div className="relative max-h-full w-full overflow-y-auto rounded-t-2xl border border-border bg-well p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:pb-5">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  The power animal field guide
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Every portfolio gets scored on how spread out it is, how jumpy
                  the names are, and how big the largest name is. Then it
                  gets the animal that fits. A fun lens, not a grade.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBestiaryOpen(false)}
                className="shrink-0 rounded-lg p-3.5 text-muted hover:bg-hover hover:text-foreground sm:p-1.5"
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
                        <p className="text-xs text-muted">{a.criteria}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      {a.vibe}
                    </p>
                    <div className="mt-2 space-y-1 text-xs leading-relaxed">
                      <p className="flex gap-1.5 text-gain">
                        <Shield className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{a.strength}</span>
                      </p>
                      <p className="flex gap-1.5 text-caution">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{a.watchFor}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ViewportOverlay>
      )}
    </SignInGate>
  );
}

function bookTodayPct(
  totalValue: number,
  todayDollar: number
): number | null {
  const previous = totalValue - todayDollar;
  return previous > 0 ? todayDollar / previous : null;
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
  todayPct,
  personality,
  milestone,
  onOpen,
}: {
  name: string;
  isYou: boolean;
  isPending: boolean;
  totalValue: number;
  todayPct: number | null;
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
        "relative flex flex-col gap-5 overflow-hidden rounded-2xl border p-5 pl-6 text-left transition hover:brightness-110 lg:grid lg:h-auto lg:grid-rows-subgrid lg:row-span-6",
        tone.border,
        tone.wash
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1.5", tone.bar)}
        aria-hidden
      />
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl",
            tone.well
          )}
          aria-hidden
        >
          {personality?.animalEmoji ?? "❔"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {name}
                {isYou && (
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    (you)
                  </span>
                )}
                {isPending && (
                  <span className="ml-1.5 text-xs font-normal text-caution">
                    awaiting sign-in
                  </span>
                )}
              </p>
              <p className={cn("mt-1 text-base font-semibold", tone.name)}>
                {personality?.animal ?? "No portfolio yet"}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span
                className={cn(
                  "block text-base font-semibold tabular-nums",
                  signedTone(todayPct, "text-foreground")
                )}
              >
                {todayPct != null ? signedPercent(todayPct) : "—"}
              </span>
              <span className="mt-1 block text-sm tabular-nums text-muted">
                {currency(totalValue, 0)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {personality ? (
        <>
          <p className="text-sm leading-relaxed text-foreground/80">
            {personality.whyThisAnimal}
          </p>
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="flex gap-2 text-gain">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{personality.archetype.strength}</span>
            </p>
            <p className="flex gap-2 text-caution">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{personality.archetype.watchFor}</span>
            </p>
          </div>

          <Scoreboard className="min-h-min shrink-0 lg:h-full" cols={3}>
            <ScoreRead
              label="How spread out"
              value={`${Math.round(personality.diversificationScore)}/100`}
              band={personality.diversificationBand.label}
              detail={personality.diversificationBand.description}
            />
            <ScoreRead
              label="How jumpy"
              value={`${Math.round(personality.riskScore)}/100`}
              band={personality.riskBand.label}
              detail={personality.riskBand.description}
            />
            <ScoreRead
              label="Biggest name"
              value={
                personality.topTicker
                  ? `${cashtag(personality.topTicker)} ${personality.convictionScore}%`
                  : `${personality.convictionScore}%`
              }
              band={personality.convictionBand.label}
              detail={personality.convictionBand.description}
            />
          </Scoreboard>

          <Scoreboard className="min-h-min shrink-0 lg:h-full" cols={2}>
            <Score
              label="Modeled year"
              value={`${personality.expectedAnnualReturnPct.toFixed(1)}% a year`}
              sub={`${signedPctPoints(personality.modeledAlphaPct)} vs index`}
              subClassName={signedTone(personality.modeledAlphaPct, "text-muted")}
            />
            <Score
              label="Stretch (a rough bad year)"
              value={`${personality.maxDrawdownPct}%`}
              sub="How far these kinds of stocks have fallen in ugly years. Illustrative, not a forecast."
              valueClassName="text-loss"
            />
          </Scoreboard>

          <div className={milestone.next == null ? "max-lg:hidden" : undefined}>
            {milestone.next != null && (
              <>
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                  <span>
                    Next{" "}
                    <span className="font-medium text-foreground/80">
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
              </>
            )}
          </div>
        </>
      ) : null}
    </button>
  );
}

function ScoreRead({
  label,
  value,
  band,
  detail,
}: {
  label: string;
  value: string;
  band: string;
  detail: string;
}) {
  return (
    <div className="h-full bg-raised px-4 py-3.5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-sans text-lg font-semibold leading-none tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium text-foreground">{band}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{detail}</p>
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
      <Scoreboard cols={3}>
        <Score
          label="Today"
          value={todayPct != null ? signedPercent(todayPct) : "—"}
          sub={signedCurrency(todayDollar)}
          tone={todayDollar > 0 ? "up" : todayDollar < 0 ? "down" : undefined}
        />
        <Score label="Total value" value={currency(totalValue)} />
        <Score label="Cash" value={currency(cash)} />
      </Scoreboard>
      <div className="space-y-3 md:hidden">
        {sortedHoldings.map((h) => {
          const price = quotes[h.ticker]?.price ?? 0;
          const value = price * h.shares;
          const rowTodayPct = quotes[h.ticker]?.changePercent ?? null;
          const pctBook = totalValue > 0 ? value / totalValue : 0;
          return (
            <Card key={h.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-semibold text-foreground">
                  <TickerSymbol
                    ticker={h.ticker}
                    currency={listingCurrency(
                      h.ticker,
                      quotes[h.ticker]?.currency
                    )}
                  />
                </p>
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    signedTone(rowTodayPct, "text-muted")
                  )}
                >
                  {rowTodayPct != null ? signedPercent(rowTodayPct) : "—"}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted">
                {percent(pctBook)} of portfolio · {h.shares} sh · {currency(price)} · {currency(value)}
              </p>
            </Card>
          );
        })}
        {holdings.length === 0 && (
          <p className="rounded-xl border border-dashed border-border bg-raised px-4 py-6 text-center text-sm text-muted">
            No holdings in this portfolio.
          </p>
        )}
        <Card>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Cash</span>
            <span className="tabular-nums text-foreground">{currency(cash)}</span>
          </div>
        </Card>
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium">Today</th>
              <th className="px-3 py-2 font-medium">%</th>
              <th className="px-3 py-2 font-medium">Shares</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((h) => {
              const price = quotes[h.ticker]?.price ?? 0;
              const value = price * h.shares;
              const rowTodayPct = quotes[h.ticker]?.changePercent ?? null;
              const pctBook = totalValue > 0 ? value / totalValue : 0;
              return (
                <tr key={h.id} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">
                    <TickerSymbol
                      ticker={h.ticker}
                      currency={listingCurrency(
                        h.ticker,
                        quotes[h.ticker]?.currency
                      )}
                    />
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 font-semibold tabular-nums",
                      signedTone(rowTodayPct, "text-muted")
                    )}
                  >
                    {rowTodayPct != null ? signedPercent(rowTodayPct) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">
                    {percent(pctBook)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">
                    {h.shares}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">
                    {currency(price)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">
                    {currency(value)}
                  </td>
                </tr>
              );
            })}
            {holdings.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-muted" colSpan={6}>
                  No holdings in this portfolio.
                </td>
              </tr>
            )}
            <tr>
              <td className="px-3 py-2 text-muted" colSpan={5}>
                Cash
              </td>
              <td className="px-3 py-2 tabular-nums">{currency(cash)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
