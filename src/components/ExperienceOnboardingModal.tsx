"use client";

import { saveStoredTier, type ExperienceTier } from "@/lib/experience-tier";
import { cn } from "@/lib/format";
import { GraduationCap, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

type Props = {
  onDone: (tier: ExperienceTier) => void;
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
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  async function finish(q2: Q2Answer) {
    if (!q1) return;
    setSaving(true);
    // Lean toward whichever answer signals more experience — showing a
    // little extra to an experienced user beats hiding useful tools from
    // one we under-guessed.
    const tier: ExperienceTier =
      TIER_RANK[Q2_TIER[q2]] > TIER_RANK[Q1_TIER[q1]] ? Q2_TIER[q2] : Q1_TIER[q1];
    saveStoredTier(tier);
    try {
      await fetch("/api/account/experience-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
    } catch {
      /* localStorage already has it; sync will retry next visit */
    }
    onDone(tier);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-brand-deep/40 bg-[#161618] p-5 shadow-2xl sm:p-6">
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
      </div>
    </div>
  );
}
