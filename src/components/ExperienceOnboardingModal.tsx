"use client";

import {
  EXPERIENCE_TIERS,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { cashtag, cn } from "@/lib/format";
import {
  FALLBACK_POPULAR_TICKERS,
  type PopularTickersPayload,
} from "@/lib/popular-tickers";
import { saveWatchlist } from "@/lib/watchlist";
import { Check, GraduationCap, Settings, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  onDone: (tier: ExperienceTier, knowsOptions: boolean) => void;
};

type Q1Answer = "new" | "comfortable" | "active";
type Q2Answer = "never" | "know" | "regularly";

const Q1_OPTIONS: { id: Q1Answer; label: string; icon: typeof GraduationCap }[] = [
  { id: "new", label: "New to this, still learning the basics", icon: GraduationCap },
  { id: "comfortable", label: "Comfortable, I understand stocks and portfolios", icon: TrendingUp },
  { id: "active", label: "Very experienced, I trade actively or watch markets closely", icon: Sparkles },
];

const Q2_OPTIONS: { id: Q2Answer; label: string }[] = [
  { id: "never", label: "No, not familiar with them" },
  { id: "know", label: "I understand them but rarely use them" },
  { id: "regularly", label: "Yes, regularly" },
];

const Q1_TIER: Record<Q1Answer, ExperienceTier> = {
  new: "novice",
  comfortable: "investor",
  active: "advanced",
};
const Q2_TIER: Record<Q2Answer, ExperienceTier> = {
  never: "novice",
  know: "investor",
  regularly: "advanced",
};
const TIER_RANK: Record<ExperienceTier, number> = { novice: 0, investor: 1, advanced: 2 };

export function ExperienceOnboardingModal({ onDone }: Props) {
  const [q1, setQ1] = useState<Q1Answer | null>(null);
  const [q2, setQ2] = useState<Q2Answer | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [noteMorning, setNoteMorning] = useState(false);
  const [noteSunday, setNoteSunday] = useState(false);
  const [popular, setPopular] = useState<string[]>([...FALLBACK_POPULAR_TICKERS]);
  const [watching, setWatching] = useState<string[]>([]);
  const [result, setResult] = useState<ExperienceTier | null>(null);
  const [resultKnowsOptions, setResultKnowsOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/popular-tickers", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PopularTickersPayload | null) => {
        if (ctrl.signal.aborted) return;
        if (data?.tickers?.length) setPopular(data.tickers);
      })
      .catch(() => {
        /* keep the fallback list */
      });
    return () => ctrl.abort();
  }, []);

  async function saveAccount() {
    if (!q1 || !q2) return;
    setSaving(true);
    // Lean toward whichever answer signals more experience. Showing a
    // little extra to an experienced user beats hiding useful tools from
    // one we under-guessed.
    const tier: ExperienceTier =
      TIER_RANK[Q2_TIER[q2]] > TIER_RANK[Q1_TIER[q1]] ? Q2_TIER[q2] : Q1_TIER[q1];
    // Options UI only if they actually write them. "I understand but rarely
    // use them" still hides Call % and the covered-call panel. They can
    // turn that on in Account.
    const knowsOptions = q2 === "regularly";
    saveStoredTier(tier);
    saveStoredKnowsOptions(knowsOptions);
    try {
      await fetch("/api/account/experience-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, knowsOptions }),
      });
      await fetch("/api/account/morning-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ morning: noteMorning, sunday: noteSunday }),
      });
    } catch {
      /* localStorage already has the tier; notes can be set in Account */
    }
    setSaving(false);
    setResult(tier);
    setResultKnowsOptions(knowsOptions);
    setStep(4);
  }

  function finishWatchlist() {
    if (watching.length > 0) saveWatchlist(watching);
    setStep(5);
  }

  function toggleWatch(ticker: string) {
    setWatching((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker]
    );
  }

  const resultLabel = result ? EXPERIENCE_TIERS.find((t) => t.id === result)?.label : null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[min(85dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-brand-deep/40 bg-card p-5 shadow-2xl sm:max-w-lg sm:p-6">
        {step !== 5 ? (
          <>
            <div className="mb-4 shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-bright">
                Quick question · {step}/4
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {step === 1
                  ? "How would you describe yourself as an investor?"
                  : step === 2
                    ? "Have you used covered calls or other options strategies?"
                    : step === 3
                      ? "Want a report in your inbox?"
                      : "Any names you want to keep an eye on?"}
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                {step === 3
                  ? "Weekdays, Sundays, both, or none. You can change this anytime in Account."
                  : step === 4
                    ? "The 30 names people have been watching most this month. Tap a few. You can add more later from Home."
                    : "This just simplifies what you see. Nothing is locked, and you can change it anytime in Account."}
              </p>
            </div>

            {step === 4 ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                  <div className="flex flex-wrap gap-2">
                    {popular.map((ticker) => {
                      const on = watching.includes(ticker);
                      return (
                        <button
                          key={ticker}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleWatch(ticker)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-sm font-medium tabular-nums transition",
                            on
                              ? "border-brand/50 bg-brand/15 text-white"
                              : "border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:border-brand-mid hover:bg-brand/10"
                          )}
                        >
                          {cashtag(ticker)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4 shrink-0 space-y-2">
                  <button
                    type="button"
                    onClick={finishWatchlist}
                    className="w-full btn-primary"
                  >
                    {watching.length > 0
                      ? `Watch ${watching.length}`
                      : "Skip for now"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="w-full text-xs text-zinc-400 hover:text-zinc-300"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            ) : step === 3 ? (
              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3.5 py-3 text-left text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={noteMorning}
                    onChange={(e) => setNoteMorning(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand focus:ring-brand/50"
                  />
                  <span>
                    <span className="font-medium text-white">Weekdays</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      What to watch before the open, then a recap after the US close.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3.5 py-3 text-left text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={noteSunday}
                    onChange={(e) => setNoteSunday(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand focus:ring-brand/50"
                  />
                  <span>
                    <span className="font-medium text-white">Sundays</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      The week that just finished, plus a look at the next ones.
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveAccount()}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full text-xs text-zinc-400 hover:text-zinc-300"
                >
                  ← Back
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {step === 1
                  ? Q1_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setQ1(opt.id);
                            setStep(2);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition",
                            "border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:border-brand-mid hover:bg-brand/10"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-brand-bright" />
                          {opt.label}
                        </button>
                      );
                    })
                  : Q2_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setQ2(opt.id);
                          setStep(3);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3.5 py-3 text-left text-sm text-zinc-200 transition hover:border-brand-mid hover:bg-brand/10"
                      >
                        {opt.label}
                      </button>
                    ))}
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="mt-1 text-xs text-zinc-400 hover:text-zinc-300"
                  >
                    ← Back
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-bright">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                You&apos;re set to {resultLabel}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                We&apos;ve simplified what you see to match. Nothing&apos;s hidden for good.
              </p>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3.5 py-3 text-left text-xs text-zinc-300">
              <Settings className="h-4 w-4 shrink-0 text-brand-bright" />
              <span>
                Change this anytime in <span className="font-semibold text-white">Account</span>, including the email notes.
              </span>
            </div>
            <button
              type="button"
              onClick={() => result && onDone(result, resultKnowsOptions)}
              className="w-full btn-primary"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
