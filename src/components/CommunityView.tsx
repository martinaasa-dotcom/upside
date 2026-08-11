"use client";

import { useAuth } from "@/components/AuthProvider";
import { SignInGate } from "@/components/SignInGate";
import { UpsideLogo } from "@/components/UpsideLogo";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { currency, percent, signedCurrency, cn } from "@/lib/format";
import { buildOverview } from "@/lib/overview";
import type { Holding, Portfolio, Quote } from "@/lib/types";
import {
  ArrowLeft,
  Link2,
  Shield,
  UserMinus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

type Member = {
  user_id: string;
  role: string;
  joined_at: string;
  profile: Profile | null;
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

export function CommunityView({ communityId }: Props) {
  const { profile: me } = useAuth();
  const [community, setCommunity] = useState<CommunityMeta | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [portfolios, setPortfolios] = useState<OwnedPortfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ownership, setOwnership] = useState<
    { portfolio_id: string; user_id: string }[]
  >([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(
    null
  );
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setIsAdmin(Boolean(meta.isAdmin));
      setPortfolios(book.portfolios ?? []);
      setHoldings(book.holdings ?? []);
      setProfiles(book.profiles ?? []);
      setOwnership(book.ownership ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load community");
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const p =
        profiles.find((x) => x.id === id) ??
        members.find((m) => m.user_id === id)?.profile;
      return p?.display_name || p?.email || "Member";
    },
    [profiles, members]
  );

  const overview = useMemo(
    () => buildOverview(portfolios, holdings, quotes),
    [portfolios, holdings, quotes]
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
    if (!confirm("Remove this member from the community?")) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
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
            <Link href="/" className="shrink-0" aria-label="Upside home">
              <UpsideLogo
                variant="wordmark"
                className="translate-y-[3px] text-[15px] leading-none text-white"
              />
            </Link>
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
                          <div className="text-sm font-medium text-zinc-100">
                            {profileName(m.user_id)}
                            {m.user_id === me?.id && (
                              <span className="ml-2 text-xs text-zinc-500">
                                (you)
                              </span>
                            )}
                          </div>
                          {m.profile?.bio ? (
                            <div className="text-xs text-zinc-400">
                              {m.profile.bio}
                            </div>
                          ) : null}
                          <div className="text-xs text-zinc-500">
                            {m.role}
                            {" · "}
                            {sheets.length} portfolio
                            {sheets.length === 1 ? "" : "s"}
                            {" · "}
                            {currency(sheetValue)}
                          </div>
                        </button>
                        {isAdmin && m.user_id !== me?.id && (
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
                              onClick={() => void removeMember(m.user_id)}
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
                </ul>
              </section>

              {isAdmin && (
                <section className="space-y-3 rounded-xl border border-zinc-800 p-4">
                  <h2 className="text-sm font-medium text-zinc-200">
                    Admin · invite
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Invites join the community; members share their whole book
                    read-only.
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
                    <p className="break-all text-xs text-emerald-400/90">
                      Copied: {inviteUrl}
                    </p>
                  )}
                </section>
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
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedPortfolioId(p.id)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/50"
                        >
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="text-xs text-zinc-400">
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
    </SignInGate>
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
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="border-b border-zinc-800 text-xs text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Ticker</th>
            <th className="px-3 py-2 font-medium">Shares</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">P&L</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const price = quotes[h.ticker]?.price ?? 0;
            const value = price * h.shares;
            const cost = h.buy_price * h.shares;
            const pnl = value - cost;
            return (
              <tr key={h.id} className="border-b border-zinc-800/60">
                <td className="px-3 py-2 font-medium">{h.ticker}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-400">
                  {h.shares}
                </td>
                <td className="px-3 py-2 tabular-nums">{currency(price)}</td>
                <td className="px-3 py-2 tabular-nums">{currency(value)}</td>
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
          <tr>
            <td className="px-3 py-2 text-zinc-500" colSpan={3}>
              Cash
            </td>
            <td className="px-3 py-2 tabular-nums" colSpan={2}>
              {currency(cash)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
