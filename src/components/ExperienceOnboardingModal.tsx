"use client";

import {
  EXPERIENCE_TIERS,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { cn } from "@/lib/format";
import { Check, GraduationCap, Settings, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

type Props = {
  onDone: (tier: ExperienceTier, knowsOptions: boolean) => void;
};

type Q1Answer = "new" | "comfortable" | "active";
type Q2Answer = "never" | "know" | "regularly";

const Q1_OPTIONS: { id: Q1Answer; label: string; icon: typeof GraduationCap }[] = [
  { id: "new", label: "New to this — still learning the basics", icon: GraduationCap },
  { id: "comfortable", label: "Comfortable — I understand stocks and portfolios", icon: TrendingUp },
  { id: "active", label: "Very experienced — I trade actively or watch markets closely", icon: Sparkles },
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [result, setResult] = useState<ExperienceTier | null>(null);
  const [resultKnowsOptions, setResultKnowsOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  async function finish(q2: Q2Answer) {
    if (!q1) return;
    setSaving(true);
    // Lean toward whichever answer signals more experience — showing a
    // little extra to an experienced user beats hiding useful tools from
    // one we under-guessed.
    const tier: ExperienceTier =
      TIER_RANK[Q2_TIER[q2]] > TIER_RANK[Q1_TIER[q1]] ? Q2_TIER[q2] : Q1_TIER[q1];
    // Options familiarity is answered directly by Q2, not blended with
    // Q1 the way the overall tier is -- someone can be "very experienced"
    // overall (Q1) and still have zero options experience (Q2), and that
    // combination should hide every options surface, not show them.
    const knowsOptions = q2 !== "never";
    saveStoredTier(tier);
    saveStoredKnowsOptions(knowsOptions);
    try {
      await fetch("/api/account/experience-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, knowsOptions }),
      });
    } catch {
      /* localStorage already has it; sync will retry next visit */
    }
    setSaving(false);
    setResult(tier);
    setResultKnowsOptions(knowsOptions);
    setStep(3);
  }

  const resultLabel = result ? EXPERIENCE_TIERS.find((t) => t.id === result)?.label : null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-brand-deep/40 bg-[#161618] p-5 shadow-2xl sm:p-6">
        {step !== 3 ? (
          <>
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-bright">
                Quick question · {step}/2
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {step === 1
                  ? "How would you describe yourself as an investor?"
                  : "Have you used covered calls or other options strategies?"}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                This just simplifies what you see — nothing is locked, and you can change it anytime in Account.
              </p>
            </div>

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
                      disabled={saving}
                      onClick={() => void finish(opt.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3.5 py-3 text-left text-sm text-zinc-200 transition hover:border-brand-mid hover:bg-brand/10 disabled:opacity-50"
                    >
                      {opt.label}
                    </button>
                  ))}
            </div>

            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-3 text-xs text-zinc-500 hover:text-zinc-300"
              >
                ← Back
              </button>
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
                Change this anytime: <span className="font-semibold text-white">Account → Experience level</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => result && onDone(result, resultKnowsOptions)}
              className="w-full rounded-xl bg-brand-bright px-4 py-2.5 text-sm font-semibold text-[#1a1510] hover:bg-[#F0E4C8]"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
