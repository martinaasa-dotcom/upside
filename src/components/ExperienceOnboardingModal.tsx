"use client";

import {
  EXPERIENCE_TIERS,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { cn } from "@/lib/format";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import { Check, GraduationCap, Settings, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [noteMorning, setNoteMorning] = useState(false);
  const [noteSunday, setNoteSunday] = useState(true);
  const [result, setResult] = useState<ExperienceTier | null>(null);
  const [resultKnowsOptions, setResultKnowsOptions] = useState(true);
  const [saving, setSaving] = useState(false);

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
      await postJsonOrQueue("/api/account/experience-tier", {
        tier,
        knowsOptions,
      });
      await postJsonOrQueue("/api/account/morning-note", {
        morning: noteMorning,
        sunday: noteSunday,
      });
    } catch {
      /* localStorage already has the tier; notes can be set in Account */
    }
    setSaving(false);
    setResult(tier);
    setResultKnowsOptions(knowsOptions);
    setStep(4);
  }

  const resultLabel = result ? EXPERIENCE_TIERS.find((t) => t.id === result)?.label : null;

  return (
    <ViewportOverlay className="z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[min(100%,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-2xl sm:max-w-lg sm:p-6">
        {step !== 4 ? (
          <>
            <div className="mb-4 shrink-0">
              <p className="text-sm font-semibold text-muted-foreground">
                Quick question · {step}/3
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                {step === 1
                  ? "How would you describe yourself as an investor?"
                  : step === 2
                    ? "Have you used covered calls or other options strategies?"
                    : "Want a report in your inbox?"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {step === 3
                  ? "Sunday is on. Weekdays only if you want them. These start once there are names in your portfolio. Change this anytime in Account."
                  : "This just simplifies what you see. Nothing is locked, and you can change it anytime in Account."}
              </p>
            </div>

            {step === 3 ? (
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 rounded-xl border border-border bg-raised px-3.5 py-3 text-left text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={noteMorning}
                    onChange={(e) => setNoteMorning(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-brand-mid bg-well text-foreground focus:ring-white/40"
                  />
                  <span>
                    <span className="font-medium text-foreground">Weekdays</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      What to watch before the open, then a recap after the US close.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-border bg-raised px-3.5 py-3 text-left text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={noteSunday}
                    onChange={(e) => setNoteSunday(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-brand-mid bg-well text-foreground focus:ring-white/40"
                  />
                  <span>
                    <span className="font-medium text-foreground">Sundays</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
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
                  className="w-full text-sm text-muted-foreground hover:text-foreground/80"
                >
                  ← Back
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
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
                            "border-border bg-raised text-foreground hover:border-brand/40 hover:bg-hover"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-foreground/80" />
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
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-raised px-3.5 py-3 text-left text-sm text-foreground transition hover:border-brand/40 hover:bg-hover"
                      >
                        {opt.label}
                      </button>
                    ))}
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="mt-1 text-sm text-muted-foreground hover:text-foreground/80"
                  >
                    ← Back
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-4 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-hover text-foreground">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                You&apos;re set to {resultLabel}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Next, paste what you own. That is the whole start.
              </p>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-raised px-3.5 py-3 text-left text-sm text-foreground/80">
              <Settings className="h-4 w-4 shrink-0 text-foreground/80" />
              <span>
                Change the view and the email notes anytime in{" "}
                <span className="font-semibold text-foreground">Account</span>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => result && onDone(result, resultKnowsOptions)}
              className="w-full btn-primary"
            >
              Add what you own
            </button>
          </div>
        )}
      </div>
    </ViewportOverlay>
  );
}
