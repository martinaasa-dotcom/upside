"use client";

import {
  currency,
  percent,
  signedCurrency,
  cn,
} from "@/lib/format";
import type { ConvictionMap } from "@/lib/conviction";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { fearGreedTone } from "@/lib/market/fear-greed";
import type { OverviewModel } from "@/lib/overview";
import {
  PULSE_MOVE_THRESHOLD,
  pickPulseCandidates,
  pulseCacheKey,
  loadPulseCache,
  savePulseCache,
  statusLabel,
  type PulseCheck,
  type PulseReport,
  type ThesisStatus,
} from "@/lib/thesis-pulse";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  model: OverviewModel;
  convictions: ConvictionMap;
};

function StatusIcon({ status }: { status: ThesisStatus }) {
  if (status === "intact")
    return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "watch")
    return <Eye className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-rose-400" />;
}

function statusBorder(status: ThesisStatus) {
  if (status === "intact") return "border-emerald-500/30 bg-emerald-950/20";
  if (status === "watch") return "border-amber-500/30 bg-amber-950/15";
  return "border-rose-500/30 bg-rose-950/20";
}

export function PulsePage({ model, convictions }: Props) {
  const candidates = useMemo(() => pickPulseCandidates(model), [model]);
  const cacheKey = useMemo(
    () => pulseCacheKey(candidates.map((c) => c.ticker)),
    [candidates]
  );

  const [report, setReport] = useState<PulseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);

  useEffect(() => {
    const cached = loadPulseCache(cacheKey);
    if (cached) setReport(cached);
    else setReport(null);
  }, [cacheKey]);

  useEffect(() => {
    let alive = true;
    void fetch("/api/market/fear-greed")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.score != null) setFearGreed(data as FearGreedSnapshot);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const runPulse = useCallback(
    async (force = false) => {
      if (candidates.length === 0) return;
      if (!force) {
        const cached = loadPulseCache(cacheKey);
        if (cached) {
          setReport(cached);
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const convictionPayload: Record<
          string,
          { thesis?: string; level?: number }
        > = {};
        for (const c of candidates) {
          const entry = convictions[c.ticker.toUpperCase()];
          if (entry) {
            convictionPayload[c.ticker.toUpperCase()] = {
              thesis: entry.thesis,
              level: entry.level,
            };
          }
        }

        const res = await fetch("/api/thesis/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidates,
            convictions: convictionPayload,
            fearGreed,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Pulse check failed");
        }
        const next = data.report as PulseReport;
        setReport(next);
        savePulseCache(cacheKey, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pulse check failed");
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, candidates, convictions, fearGreed]
  );

  useEffect(() => {
    if (candidates.length === 0) return;
    void runPulse(false);
  }, [candidates, runPulse]);

  const checksByTicker = useMemo(() => {
    const map = new Map<string, PulseCheck>();
    for (const check of report?.checks ?? []) {
      map.set(check.ticker.toUpperCase(), check);
    }
    return map;
  }, [report]);

  const movePctLabel = (pct: number) =>
    `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-bright">
              Thesis Pulse
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Are the big movers still on thesis?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Scans your largest holdings that moved{" "}
              {movePctLabel(PULSE_MOVE_THRESHOLD)} or more today. Plain read on
              why they moved, whether earnings broke anything, and if the thesis
              still holds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runPulse(true)}
            disabled={loading || candidates.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh check
          </button>
        </div>

        {fearGreed && (
          <p className="mt-3 text-xs text-zinc-500">
            Market mood: Fear &amp; Greed{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                fearGreedTone(fearGreed.score) === "fear" && "text-sky-300",
                fearGreedTone(fearGreed.score) === "neutral" && "text-zinc-300",
                fearGreedTone(fearGreed.score) === "greed" && "text-amber-300"
              )}
            >
              {fearGreed.score}
            </span>{" "}
            · {fearGreed.rating}
          </p>
        )}

        {report?.summary && (
          <p className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200">
            {report.summary}
          </p>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {candidates.length === 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-4 py-8 text-center">
          <p className="text-sm text-zinc-300">
            No big positions moved {movePctLabel(PULSE_MOVE_THRESHOLD)} today.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Pulse only flags material book lines with a sharp day move — quiet
            days stay quiet.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {candidates.map((c) => {
            const check = checksByTicker.get(c.ticker.toUpperCase());
            const up = (c.todayPct ?? 0) >= 0;
            const status = check?.thesisStatus ?? "watch";

            return (
              <li
                key={c.ticker}
                className={cn(
                  "rounded-xl border px-4 py-4",
                  check ? statusBorder(status) : "border-zinc-800 bg-[#161618]/60"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-white">
                        {c.ticker}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-sm font-medium tabular-nums",
                          up ? "text-gain" : "text-loss"
                        )}
                      >
                        {up ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {c.todayPct != null ? movePctLabel(c.todayPct) : "—"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {percent(c.bookPct)} of book ·{" "}
                        {signedCurrency(c.todayDollar)} today
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {currency(c.currentValue)} position · lifetime{" "}
                      {percent(c.roiPct)} · {c.portfolios.join(", ")}
                    </p>
                  </div>
                  {check && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950/50 px-2.5 py-1 text-[11px] font-medium text-zinc-200">
                      <StatusIcon status={status} />
                      {statusLabel(status)}
                    </span>
                  )}
                </div>

                {loading && !check ? (
                  <p className="mt-3 text-sm text-zinc-500">Checking thesis…</p>
                ) : check ? (
                  <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
                    <p>
                      <span className="font-medium text-zinc-200">Why:</span>{" "}
                      {check.moveReason}
                    </p>
                    {check.earningsNote ? (
                      <p>
                        <span className="font-medium text-zinc-200">
                          Earnings:
                        </span>{" "}
                        {check.earningsNote}
                      </p>
                    ) : null}
                    <p className="text-zinc-100">{check.verdict}</p>
                  </div>
                ) : null}

                {convictions[c.ticker.toUpperCase()]?.thesis ? (
                  <p className="mt-3 border-t border-zinc-800/80 pt-2 text-xs text-zinc-500">
                    Your thesis: {convictions[c.ticker.toUpperCase()].thesis}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {report?.generatedAt && (
        <p className="text-center text-[11px] text-zinc-600">
          Last checked{" "}
          {new Date(report.generatedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {" · "}
          cached for today
        </p>
      )}
    </div>
  );
}
