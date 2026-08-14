"use client";

import { cn } from "@/lib/format";
import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * The Upside Lab design system, in one file.
 *
 * Before this existed every panel rolled its own shell, and the app drifted
 * into three visual dialects: Overview on rounded-3xl with text-xl headings,
 * Pulse/Forecast/Lab on rounded-xl with text-sm headings, and the
 * drawer/simulator/compound sheets on 9-11px type with Title Case
 * "Forecast Trajectory Model" style labels. Same product, three fonts scales,
 * four corner radii, six card backgrounds.
 *
 * The rules, so a new surface can't drift again:
 *
 *   Radius     shell rounded-2xl · card rounded-xl · control rounded-lg
 *   Shell      border-brand/20 on bg-card
 *   Card       border-white/10 on bg-card
 *   Headings   text-base font-semibold (hero: text-lg) · sentence case
 *   Type       one editorial serif for UI and titles. Not a tech sans
 *              stacked on a second display face.
 *   Micro      text-xs uppercase tracking-wide text-zinc-400
 *   Body       text-sm leading-relaxed text-zinc-400
 *   Floor      nothing below text-xs. Ever.
 *   Measure    copy inside a panel fills the panel. Do not pinch it to a
 *              reading column. That leaves a dead strip of empty card and
 *              wraps a sentence for no reason.
 *
 * Sentence case is not cosmetic. "Year-by-Year Target Roadmap" reads like a
 * consultant's slide; "Price path" reads like a person wrote it.
 */

const SHELL_TONES = {
  default: "border-brand/20 bg-card/80",
  plain: "border-white/10 bg-card/80",
  brand: "border-brand/35 bg-brand/[0.07]",
  warn: "border-amber-500/30 bg-amber-500/[0.07]",
  danger: "border-rose-500/30 bg-rose-950/20",
} as const;

export type PanelTone = keyof typeof SHELL_TONES;

/** A top-level section. One per idea, never nested inside another Panel. */
export function Panel({
  tone = "default",
  padded = true,
  className,
  children,
  ...rest
}: {
  tone?: PanelTone;
  /** Off for panels whose own children own the edges (tables, lists). */
  padded?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section
      className={cn(
        "rounded-2xl border",
        SHELL_TONES[tone],
        padded && "p-4 sm:p-6",
        className
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/**
 * Title, one line of what-this-is, and controls on the right.
 *
 * The subtitle is required rather than optional on purpose: every panel in
 * this app has to answer "what am I looking at" for someone who does not
 * already know what a covered call or a drawdown is.
 */
export function PanelHeader({
  title,
  subtitle,
  icon,
  iconTone = "brand",
  hero = false,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  icon?: ReactNode;
  iconTone?: "brand" | "violet" | "emerald" | "zinc";
  /** Slightly larger, for the one panel that opens a page. */
  hero?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const iconTones = {
    brand: "bg-brand/15 text-brand-bright",
    violet: "bg-violet-500/15 text-violet-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    zinc: "bg-zinc-800 text-zinc-300",
  } as const;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {icon && (
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              iconTones[iconTone]
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "font-heading font-semibold text-white",
              hero ? "text-lg sm:text-xl" : "text-base"
            )}
          >
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">
            {subtitle}
          </p>
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

const CARD_TONES = {
  default: "border-white/10 bg-card",
  raised: "border-white/10 bg-hover",
  brand: "border-brand/30 bg-brand/10",
  good: "border-emerald-500/25 bg-emerald-500/[0.07]",
  warn: "border-amber-500/30 bg-amber-500/[0.07]",
  bad: "border-rose-500/25 bg-rose-500/[0.07]",
  info: "border-sky-500/25 bg-sky-500/[0.07]",
} as const;

export type CardTone = keyof typeof CARD_TONES;

/** A card inside a Panel. Interactive ones get the hover/press treatment. */
export function Card({
  tone = "default",
  interactive = false,
  className,
  children,
  ...rest
}: {
  tone?: CardTone;
  interactive?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        CARD_TONES[tone],
        interactive &&
          "transition hover:border-white/20 hover:bg-hover active:scale-[0.995]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Small all-caps label above a value. The floor is text-xs. */
export function MicroLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-0.5 text-xs font-medium uppercase tracking-wide text-zinc-400",
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * Tap-to-open explainer. Not hover-only: hover doesn't exist on touch, and
 * the numbers these sit beside are the first thing a new user reads.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onBlur={() => setOpen(false)}
        aria-label={label ?? "What does this mean?"}
        aria-expanded={open}
        className="touch-target inline-flex items-center justify-center p-1.5 text-zinc-400 transition hover:text-zinc-200"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-48 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-zinc-200 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** Label, big number, one line of context. Optionally an explainer bubble. */
export function Stat({
  label,
  value,
  sub,
  explain,
  valueClassName,
  subClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  explain?: string;
  valueClassName?: string;
  subClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5",
        className
      )}
    >
      <MicroLabel>
        {label}
        {explain && <InfoTip text={explain} />}
      </MicroLabel>
      <p
        className={cn(
          "mt-1 text-base font-semibold tabular-nums sm:text-lg",
          valueClassName ?? "text-white"
        )}
      >
        {value}
      </p>
      {sub != null && (
        <p className={cn("mt-0.5 text-xs", subClassName ?? "text-zinc-400")}>
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * The one segmented toggle. Overview's today/lifetime, the drawer's 3y/5y,
 * and the scenario picker used to be four hand-rolled copies with three
 * different active states.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className,
}: {
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 rounded-lg border border-zinc-700 bg-zinc-950/50 p-0.5",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          disabled={disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-40",
            value === o.id
              ? "bg-brand/20 text-brand-bright"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PILL_TONES = {
  neutral: "border-zinc-700 bg-zinc-900/80 text-zinc-300",
  brand: "border-brand/40 bg-brand/15 text-brand-bright",
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  bad: "border-rose-500/40 bg-rose-500/15 text-rose-200",
  info: "border-violet-400/40 bg-violet-500/15 text-violet-200",
} as const;

export type PillTone = keyof typeof PILL_TONES;

/** Status chip. Never smaller than text-xs, never a bare coloured dot alone. */
export function Pill({
  tone = "neutral",
  title,
  className,
  children,
}: {
  tone?: PillTone;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
        PILL_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** What a panel shows when it has nothing to show. Says what to do next. */
export function EmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {detail && (
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-zinc-400">
          {detail}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
