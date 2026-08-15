"use client";

import { cashtag, cn } from "@/lib/format";
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
 *   Shell      border-border on bg-card. Selected is brass. Mustard is
 *              the main button. Paper is type, never a white pill.
 *   Card       border-border on bg-card. The box has to lift off the field.
 *   Type scale, the only sizes a person should see:
 *   text-xs    12  labels, meta, table, chips
 *   text-sm    14  chrome, inputs, buttons, nav
 *   text-base  16  titles, tickers, figures, briefing / thesis prose
 *   text-lg    18  hero panel title (one opener per page)
 *   text-2xl   24  display numbers only (book value, compound result)
 *              No text-[Npx]. No sm:text-xl jumps on titles.
 *              No text-3xl or text-4xl. The logo lockup is the exception.
 *   Headings   text-base font-bold (hero: text-lg) · sentence case
 *   Type       Montserrat Bold for titles. Inter for body, labels, and
 *              every money figure. No third face. Lockup is Montserrat.
 *   Micro      text-xs font-medium text-muted · sentence case
 *              Caps stay on the logo only.
 *   Metrics    label over figure, inside a card. The box is the grouping.
 *              Do not park unlabeled numbers on the far right of a row.
 *   Reading    a dark card, brass label, same type as the page. Thesis
 *              and Worth noticing live in a box. Not a cream slab, and
 *              not loose type on the field.
 *   Body       text-sm leading-relaxed text-muted for chrome
 *   Floor      nothing below text-xs. Ever.
 *   Air        padding and gaps do the explaining. Do not stack a subtitle,
 *              a blurb, and a hint that all say the same thing.
 *   Measure    copy inside a panel fills the panel. Do not pinch it to a
 *              reading column. That leaves a dead strip of empty card and
 *              wraps a sentence for no reason.
 *
 * Sentence case is not cosmetic. "Year-by-Year Target Roadmap" reads like a
 * consultant's slide; "Price path" reads like a person wrote it.
 */

const SHELL_TONES = {
  default: "border-border bg-card/80",
  plain: "border-border bg-card/80",
  brand: "border-brand/40 bg-hover",
  warn: "border-caution/35 bg-caution/[0.08]",
  danger: "border-loss/30 bg-loss/[0.08]",
} as const;

const FIGURE =
  "mt-1 font-sans text-base font-semibold tabular-nums";

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
        "h-full rounded-2xl border",
        SHELL_TONES[tone],
        padded && "p-5 sm:p-8",
        className
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/**
 * Title and controls on the right. A subtitle only when the title is not
 * enough on its own. Most panels should skip it.
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
  subtitle?: ReactNode;
  icon?: ReactNode;
  iconTone?: "brand" | "violet" | "emerald" | "zinc";
  /** Slightly larger, for the one panel that opens a page. */
  hero?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const iconTones = {
    brand: "bg-hover text-foreground/80",
    violet: "bg-brand/15 text-brand-bright",
    emerald: "bg-gain/15 text-gain",
    zinc: "bg-hover text-foreground/80",
  } as const;

  return (
    <div
      className={cn(
        "flex flex-wrap justify-between gap-x-4 gap-y-3",
        subtitle ? "items-start" : "items-center",
        className
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 gap-3",
          subtitle ? "items-start" : "items-center"
        )}
      >
        {icon && (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              subtitle ? "mt-0.5" : undefined,
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
              "font-heading font-bold text-foreground",
              hero ? "text-lg" : "text-base"
            )}
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {subtitle}
            </p>
          ) : null}
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
  default: "border-border bg-card",
  raised: "border-border bg-hover",
  brand: "border-brand/40 bg-hover",
  good: "border-gain/25 bg-gain/[0.08]",
  warn: "border-caution/35 bg-caution/[0.08]",
  bad: "border-loss/25 bg-loss/[0.08]",
  info: "border-border bg-hover",
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
        "h-full rounded-xl border px-4 py-4",
        CARD_TONES[tone],
        interactive &&
          "transition hover:border-brand/40 hover:bg-hover active:scale-[0.995]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Quiet label above a value. Sentence case. The floor is text-xs. */
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
        "flex items-center gap-0.5 text-xs font-medium text-muted",
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * Long sentences a person actually reads. A dark card that lifts off
 * the field, brass label, warm type. Not a cream slab, and not loose
 * type sitting on the page.
 */
export function Reading({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3.5 text-foreground",
        className
      )}
    >
      {label != null && label !== "" ? (
        <div className="text-xs font-medium text-brand-bright">{label}</div>
      ) : null}
      <div
        className={cn(
          label != null && label !== "" && "mt-1.5",
          "text-base leading-relaxed"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Cashtags stay white. Up and down take gain and loss. */
export function InsightText({ text }: { text: string }) {
  const chunks = text.split(/(\$[A-Z][A-Z0-9.]{0,11})/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        if (/^\$[A-Z][A-Z0-9.]{0,11}$/.test(chunk)) {
          return (
            <span key={i} className="font-semibold text-foreground">
              {chunk}
            </span>
          );
        }
        return <MoveTint key={i} text={chunk} />;
      })}
    </>
  );
}

function MoveTint({ text }: { text: string }) {
  const re = /(up|down)(\s+about\s+\d+(?:\.\d+)?%)?/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const up = m[1]!.toLowerCase() === "up";
    out.push(
      <span key={n++} className={up ? "text-gain" : "text-loss"}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** A boxed list of ticker + line. Used for Today's scan. */
export function ScanList({
  label,
  rows,
  onOpen,
  className,
}: {
  label?: ReactNode;
  rows: { ticker: string; text: string }[];
  onOpen?: (ticker: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      {label != null && label !== "" ? (
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-xs font-medium text-brand-bright">{label}</p>
        </div>
      ) : null}
      <ul>
        {rows.map((row) => {
          const body = (
            <>
              <span className="w-[4.75rem] shrink-0 font-semibold tabular-nums text-foreground">
                {cashtag(row.ticker)}
              </span>
              <span className="min-w-0 text-sm leading-snug text-foreground/80">
                {row.text}
              </span>
            </>
          );
          return (
            <li key={row.ticker} className="border-t border-border first:border-t-0">
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(row.ticker)}
                  className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-hover"
                >
                  {body}
                </button>
              ) : (
                <div className="flex gap-3 px-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Label over a figure. Use in a grid inside a card, never as a lonely right-edge stack. */
export function Metric({
  label,
  children,
  hint,
  className,
  valueClassName,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <MicroLabel>{label}</MicroLabel>
      <p
        className={cn(FIGURE, "text-foreground", valueClassName)}
      >
        {children}
      </p>
      {hint != null && hint !== "" ? (
        <p className="mt-0.5 truncate text-xs tabular-nums text-muted">{hint}</p>
      ) : null}
    </div>
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
        className="touch-target inline-flex items-center justify-center p-1.5 text-muted transition hover:text-foreground"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-48 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-xl"
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
  tone,
  valueClassName,
  subClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  explain?: string;
  tone?: "up" | "down";
  valueClassName?: string;
  subClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-full rounded-xl border border-border bg-card px-4 py-3.5",
        className
      )}
    >
      <MicroLabel>
        {label}
        {explain && <InfoTip text={explain} />}
      </MicroLabel>
      <p
        className={cn(
          FIGURE,
          valueClassName ??
            (tone === "up"
              ? "text-gain"
              : tone === "down"
                ? "text-loss"
                : "text-foreground")
        )}
      >
        {value}
      </p>
      {sub != null && (
        <p className={cn("mt-0.5 text-xs tabular-nums", subClassName ?? "text-muted")}>
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
        "inline-flex shrink-0 rounded-lg border border-border bg-app/50 p-0.5",
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
            "touch-target rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 md:min-h-0 md:min-w-0",
            value === o.id
              ? "bg-select text-select-ink"
              : "text-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PILL_TONES = {
  neutral: "border-border bg-card text-foreground/80",
  brand: "border-brand/40 bg-hover text-foreground",
  good: "border-gain/30 bg-gain/10 text-gain",
  warn: "border-caution/40 bg-caution/10 text-foreground",
  bad: "border-loss/40 bg-loss/15 text-loss",
  info: "border-border bg-hover text-foreground",
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
        "rounded-xl border border-dashed border-border px-5 py-10 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {detail && (
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted">
          {detail}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
