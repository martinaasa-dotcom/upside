"use client";

import { HomeWorld } from "@/components/HomeWorld";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { SignInGate } from "@/components/SignInGate";
import { BookBottomNav } from "@/components/BookBottomNav";
import { AppHeader } from "@/components/AppHeader";
import { MobileChrome } from "@/components/mobile/MobileChrome";
import { cn } from "@/lib/format";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { plainError } from "@/lib/plain-error";
import {
  loadCommunityDiscoverCache,
  loadCommunityListCache,
  prefetchCommunity,
  prefetchCommunityList,
  saveCommunityDiscoverCache,
  saveCommunityListCache,
  type CommunityDiscoverRow,
  type CommunityListRow,
} from "@/lib/community-cache";
import { StartingCashField } from "@/components/StartingCashField";
import { Panel, PanelHeader, Segmented } from "@/components/ui/Panel";
import {
  CLASS_TEMPLATES,
  classTemplateById,
  defaultClassSetup,
} from "@/lib/class-templates";
import { DEFAULT_CLASS_ASSIGNMENT } from "@/lib/classroom";
import { ChevronRight, Compass, Globe, GraduationCap, Lock, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAbortError } from "@/lib/abort";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { useNetworkResume } from "@/lib/use-network-resume";
import { useEffect, useState } from "react";

type DiscoverRow = CommunityDiscoverRow;

export function CommunitiesList() {
  const router = useRouter();
  // Hydration-safe: /communities has no auth gate in front of it, so this
  // component really is server-rendered, and seeding state straight from
  // localStorage during render made the server and client trees disagree.
  const [communities, setCommunities] = useHydratedCache<CommunityListRow[]>(
    () => loadCommunityListCache() ?? [],
    []
  );
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"circle" | "classroom">("circle");
  const initialClass = defaultClassSetup();
  const [templateId, setTemplateId] = useState(initialClass.templateId);
  const [startingCash, setStartingCash] = useState(initialClass.cash);
  const [assignment, setAssignment] = useState(initialClass.assignment);
  const [startPeriod, setStartPeriod] = useState(initialClass.period);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [error, setError] = useState<string | null>(null);
  // Only blocks on a spinner when there's truly nothing cached to show —
  // same instant-first-paint pattern as Thesis Pulse and the community detail
  // view. Server-safe value is true (no cache exists there); the cache check
  // runs in a layout effect, so a warm cache still skips the spinner in the
  // first painted frame.
  const [loading, setLoading] = useHydratedCache(
    () => (loadCommunityListCache()?.length ?? 0) === 0,
    true
  );
  const [discover, setDiscover] = useHydratedCache<DiscoverRow[]>(
    () => loadCommunityDiscoverCache() ?? [],
    []
  );
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    const hadCache = (loadCommunityListCache()?.length ?? 0) > 0;
    if (!hadCache) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/communities", { cache: "no-store", signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError(data.error, "Couldn't load your circles.")
        );
      }
      const rows = (data.communities ?? []) as CommunityListRow[];
      setCommunities(rows);
      saveCommunityListCache(rows);
      prefetchCommunityList(rows);
    } catch (e) {
      if (isAbortError(e) || signal?.aborted) return;
      if (!hadCache) setError(e instanceof Error ? e.message : "Couldn't load your circles.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function loadDiscover(signal?: AbortSignal) {
    try {
      const res = await fetch("/api/communities/discover", {
        cache: "no-store",
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const rows = (data.communities ?? []) as DiscoverRow[];
        setDiscover(rows);
        saveCommunityDiscoverCache(rows);
      }
    } catch {
      /* best-effort — discover is a bonus section, not the main list */
    }
  }

  useEffect(() => {
    prefetchCommunityList(loadCommunityListCache() ?? []);
    const ctrl = new AbortController();
    void load(ctrl.signal);
    void loadDiscover(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  useNetworkResume(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    void loadDiscover(ctrl.signal);
  });

  async function requestToJoin(communityId: string) {
    setRequestBusyId(communityId);
    try {
      const res = await fetch(`/api/communities/${communityId}/join-request`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(plainError(data.error, "Couldn't send that request."));
        return;
      }
      setDiscover((rows) => {
        const next = rows.map((r) =>
          r.id === communityId ? { ...r, requestStatus: "pending" as const } : r
        );
        saveCommunityDiscoverCache(next);
        return next;
      });
    } finally {
      setRequestBusyId(null);
    }
  }

  async function createCommunity(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        kind === "classroom"
          ? {
              name: name.trim(),
              kind: "classroom",
              startingCash,
              assignment: assignment.trim() || DEFAULT_CLASS_ASSIGNMENT,
              startPeriod,
            }
          : { name: name.trim(), visibility }
      ),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(plainError(data.error, "Couldn't create that circle."));
      return;
    }
    setName("");
    setAssignment("");
    const id = (data.community as { id?: string } | undefined)?.id;
    if (id) {
      router.push(`/communities/${id}`);
      return;
    }
    await load();
  }

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileChrome title="Communities" active="circle" />
        <AppHeader className="hidden md:block" title="Communities" />
        <main id="main" className={PAGE_MAIN_CLASS}>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              Communities
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Compare books with people you invite, or find a public circle
              below. You pick which sheets to share. Members see today&apos;s
              prices, not what you paid.
            </p>
          </div>
          <WidgetErrorBoundary name="Upside Fund">
            <HomeWorld fundOnly />
          </WidgetErrorBoundary>
          {error && <p className="text-sm text-loss">{error}</p>}
          {communities.length === 0 && loading ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-[3.75rem] animate-pulse rounded-2xl border border-border bg-card/80"
                />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/80">
              {communities.length === 0 && (
                <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Users className="h-6 w-6 text-muted" />
                  <p className="text-sm text-foreground">
                    You are not in a circle yet.
                  </p>
                  <p className="text-sm leading-relaxed text-muted">
                    Create one below for friends or family, or request to join
                    a public community further down.
                  </p>
                </li>
              )}
              {communities.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/communities/${c.id}`}
                    onPointerEnter={() => void prefetchCommunity(c.id)}
                    onFocus={() => void prefetchCommunity(c.id)}
                    className="flex items-center justify-between gap-3 px-4 py-4 transition hover:bg-brand/5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {c.kind === "classroom" ? (
                        <GraduationCap className="h-3.5 w-3.5 shrink-0 text-brand-bright/80" />
                      ) : c.visibility === "public" ? (
                        <Globe className="h-3.5 w-3.5 shrink-0 text-brand-bright" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {c.name}
                      </span>
                      {c.kind === "classroom" ? (
                        <span className="shrink-0 text-sm text-muted">
                          Class
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm capitalize text-brand-bright/80">
                        {c.role}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Compass className="h-4 w-4 text-brand-bright" />
              <h2 className="text-sm font-semibold text-foreground">
                Discover public circles
              </h2>
            </div>
            <p className="mb-3 text-sm text-muted">
              Anyone can ask to join. An admin still has to approve before
              you see any books.
            </p>
            {discover.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card/80 px-4 py-6 text-sm leading-relaxed text-muted">
                No public circles right now. If you start one, flip it to
                Public so people can ask in.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/80">
                {discover.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-brand-bright" />
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-sm text-muted">
                          {c.memberCount}{" "}
                          {c.memberCount === 1 ? "member" : "members"}
                        </span>
                      </span>
                      {c.houseNote?.trim() ? (
                        <span className="pl-5 text-sm leading-relaxed text-muted">
                          {c.houseNote.trim()}
                        </span>
                      ) : null}
                    </span>
                    {c.requestStatus === "pending" ? (
                      <span className="shrink-0 text-sm font-medium text-caution">
                        Requested · pending
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void requestToJoin(c.id)}
                        disabled={requestBusyId === c.id}
                        className="shrink-0 rounded-lg border border-border bg-well px-3 py-1.5 text-sm font-semibold text-foreground hover:border-brand/50 hover:text-foreground disabled:opacity-50"
                      >
                        {requestBusyId === c.id
                          ? "Requesting …"
                          : c.requestStatus === "rejected"
                            ? "Request again"
                            : "Request to join"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={(e) => void createCommunity(e)}>
            <Panel>
              <PanelHeader
                title="Create a community"
                subtitle={
                  kind === "classroom"
                    ? "High school or uni. Students join with a link. Everyone starts with the same paper cash and an empty sheet. Real prices. No brokerage."
                    : "A private circle for people you invite, or a public one people can ask to join."
                }
                actions={
                  <Segmented
                    ariaLabel="Community type"
                    options={[
                      { id: "circle", label: "Circle" },
                      { id: "classroom", label: "Class" },
                    ]}
                    value={kind}
                    onChange={setKind}
                  />
                }
              />

              <div className="mt-8 space-y-8">
                <label className="block">
                  <span className="text-sm font-medium text-muted">
                    {kind === "classroom" ? "Class name" : "Name"}
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      kind === "classroom"
                        ? "Econ 201"
                        : "Community name"
                    }
                    className="mt-2 w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand"
                  />
                </label>

                {kind === "classroom" ? (
                  <>
                    <div>
                      <p className="text-sm font-medium text-muted">
                        How the class runs
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        Pick the closest match. You can change the cash, the
                        note, and the trading rules after you start.
                      </p>
                      <div className="mt-4 divide-y divide-white/10">
                        {CLASS_TEMPLATES.map((t) => {
                          const on = templateId === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                const next = classTemplateById(t.id);
                                setTemplateId(next.id);
                                setStartingCash(next.cash);
                                setAssignment(next.assignment);
                                setStartPeriod(next.period);
                              }}
                              className={cn(
                                "flex w-full flex-col gap-1 py-4 text-left transition first:pt-1 last:pb-1",
                                on
                                  ? "text-foreground"
                                  : "text-foreground/80 hover:text-foreground"
                              )}
                            >
                              <span
                                className={cn(
                                  "text-sm font-semibold",
                                  on ? "text-foreground" : "text-foreground"
                                )}
                              >
                                {t.title}
                              </span>
                              <span className="text-sm leading-relaxed text-muted">
                                {t.blurb}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <StartingCashField
                      value={startingCash}
                      onChange={setStartingCash}
                    />
                    <label className="block">
                      <span className="text-sm font-medium text-muted">
                        What we&apos;re learning
                      </span>
                      <textarea
                        value={assignment}
                        onChange={(e) => setAssignment(e.target.value)}
                        maxLength={800}
                        rows={4}
                        placeholder={DEFAULT_CLASS_ASSIGNMENT}
                        className="mt-2 w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted focus:border-brand"
                      />
                    </label>
                  </>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-muted">Who can join</p>
                    <div className="mt-3">
                      <Segmented
                        ariaLabel="Who can join"
                        className="flex-wrap"
                        options={[
                          { id: "private", label: "Invite only" },
                          { id: "public", label: "Anyone can request" },
                        ]}
                        value={visibility}
                        onChange={setVisibility}
                      />
                    </div>
                  </div>
                )}

                <button type="submit" className="btn-primary">
                  {kind === "classroom" ? "Start a class" : "Create community"}
                </button>
              </div>
            </Panel>
          </form>
        </main>
        <BookBottomNav />
      </div>
    </SignInGate>
  );
}
