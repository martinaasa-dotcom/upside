"use client";

import { filledCardColumns, filledGridColumns } from "@/lib/filled-grid";
import { cashtag, cn, splitMoveTint } from "@/lib/format";
import { Info } from "lucide-react";
import {
  Children,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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
 *   Shell      black field, graphite card. Selected is brass. Mustard is
 *              the main button. Paper is type, never a white pill.
 *              Green is an up number, not a wash.
 *   Stack      field is --app. A box on the field is bg-card. Nested is
 *              bg-raised. Inputs sit in bg-well. Never paint a box with
 *              the field color, and never a transparent card on the field.
 *   Card       border-border on bg-raised. Nested boxes lift off the panel.
 *   Type scale, the only sizes a person should see:
 *   text-xs    12  tables and chart ticks only. Not labels. Not chips.
 *              Chart ticks are HTML (ChartYAxis). Never SVG <text>,
 *              which scales with the viewBox and blows up on a wide screen.
 *   text-sm    14  labels, meta, chips, chrome, inputs, buttons, nav
 *   text-base  16  titles, tickers, Metric figures, briefing / thesis prose
 *   text-lg    18  hero panel title, and every scoreboard figure
 *   text-2xl   24  one hero number per page (compound result). Not a row of tiles.
 *              No text-[Npx]. No sm:text-xl jumps on titles.
 *              No text-3xl or text-4xl. The logo lockup is the exception.
 *   Headings   text-base font-bold (hero: text-lg) · sentence case
 *   Type       Montserrat Bold for titles. Inter for body, labels, and
 *              every money figure. No third face. Lockup is Montserrat.
 *   Micro      text-sm font-medium text-muted · sentence case
 *              Caps stay on the logo only.
 *   Metrics    A row of numbers is ONE box (Scoreboard) with hairline
 *              columns (Score). Do not nest four Stat tiles in a panel.
 *              Stat is the same cell, used alone. Figures are text-lg.
 *              Do not park a paragraph in the sub line.
 *              Do not park unlabeled numbers on the far right of a row.
 *   Reading    a dark card, quiet label, same type as the page. Thesis
 *              and Worth noticing live in a box. Not a cream slab, and
 *              not loose type on the field.
 *   Body       text-sm leading-relaxed text-muted for chrome
 *   Floor      nothing below text-xs. Ever.
 *   Air        padding and gaps do the explaining. Do not stack a subtitle,
 *              a blurb, and a hint that all say the same thing.
 *   Measure    copy inside a panel fills the panel. Do not pinch it to a
 *              reading column. That leaves a dead strip of empty card and
 *              wraps a sentence for no reason.
 *   Split      title/copy + controls use SPLIT_ROW / SPLIT_COPY /
 *              SPLIT_ACTIONS. Never `flex-wrap` + `min-w-0 flex-1` next to
 *              shrink-0 chrome. On a phone that leftover strip is ~80px
 *              and the sentence wraps one word per line.
 *   Inset      page gutter and panel pad are p-panel (20px). Nested
 *              cards and score cells are p-nested (16px). Same on a
 *              phone. Do not override to p-4 on mobile. Label to
 *              figure is mt-1. InfoTip must not stretch that row.
 *              A row of numbers is Scoreboard, never a loose
 *              MicroLabel grid with its own padding.
 *   Hairline   gap-px + bg-border grids (Scoreboard, Segmented fill,
 *              HairlineGrid) paint every track. The last row must be
 *              full. Never an empty leftover box. Snap columns with
 *              filledGridColumns / filledCardColumns. Do not hand-roll
 *              grid-cols-N on that pattern.
 *
 * Sentence case is not cosmetic. "Year-by-Year Target Roadmap" reads like a
 * consultant's slide; "Price path" reads like a person wrote it.
 */

/** Page-level box. Solid fill so it never matches the field. */
export const BOX = "rounded-2xl border border-border bg-card";
/** Nested card inside a box. */
export const CARD = "rounded-xl border border-border bg-raised";
/** Panel padding. Matches the page gutter. */
export const PANEL_PAD = "p-panel";
/** Nested card / score-cell padding. One step in from the panel. */
export const NESTED_PAD = "p-nested";
/** A Scoreboard cell. Use this instead of hand-rolling px-4 py-3.5. */
export const SCORE_CELL = "min-w-0 bg-raised p-nested";
/** Member / row list on the field. */
export const LIST =
  "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card";

const SHELL_TONES = {
  default: "border-border bg-card",
  plain: "border-border bg-card",
  brand: "border-brand/40 bg-hover",
  warn: "border-caution/35 bg-caution/[0.08]",
  danger: "border-loss/30 bg-loss/[0.08]",
} as const;

const FIGURE =
  "mt-1 font-sans text-base font-semibold tabular-nums";
const DISPLAY =
  "mt-1 min-w-0 font-sans text-base font-semibold leading-none tabular-nums whitespace-nowrap sm:text-lg";

export type PanelTone = keyof typeof SHELL_TONES;

/**
 * Copy on the left, chrome on the right. Stacks on a phone so the sentence
 * gets the full card; sits on one row from `sm` up.
 */
export const SPLIT_ROW =
  "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between";
/** The text side of a SPLIT_ROW. Full width in the column; grows on `sm`. */
export const SPLIT_COPY = "min-w-0 w-full sm:w-auto sm:min-w-[12rem] sm:flex-1";
/** Buttons, selects, figures. Never shrink the copy to make room. */
export const SPLIT_ACTIONS =
  "flex w-full max-w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto";

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
        "h-full min-w-0 max-w-full rounded-2xl border",
        SHELL_TONES[tone],
        padded && PANEL_PAD,
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
        SPLIT_ROW,
        !subtitle && "sm:items-center",
        className
      )}
    >
      <div
        className={cn(
          SPLIT_COPY,
          "flex gap-3",
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
      {actions && <div className={SPLIT_ACTIONS}>{actions}</div>}
    </div>
  );
}

const CARD_TONES = {
  default: "border-border bg-raised",
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
        "rounded-xl border",
        NESTED_PAD,
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

/** Quiet label above a value. Sentence case. Chrome floor is text-sm. */
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
        "flex items-center gap-1 text-sm font-medium text-muted",
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * Long sentences a person actually reads. A dark card that lifts off
 * the field, quiet label, warm type. Not a cream slab, and not loose
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
        "rounded-xl border border-border bg-raised text-foreground",
        NESTED_PAD,
        className
      )}
    >
      {label != null && label !== "" ? (
        <div className="text-sm font-medium text-muted">{label}</div>
      ) : null}
      <div
        className={cn(
          label != null && label !== "" && "mt-2",
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
  return (
    <>
      {splitMoveTint(text).map((span, i) =>
        span.tone ? (
          <span
            key={i}
            className={span.tone === "up" ? "text-gain" : "text-loss"}
          >
            {span.text}
          </span>
        ) : (
          span.text
        )
      )}
    </>
  );
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
        "overflow-hidden rounded-xl border border-border bg-raised",
        className
      )}
    >
      {label != null && label !== "" ? (
        <div className="border-b border-border px-nested py-3">
          <p className="text-sm font-medium text-muted">{label}</p>
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
                  className="flex w-full gap-3 px-nested py-3 text-left transition hover:bg-hover"
                >
                  {body}
                </button>
              ) : (
                <div className="flex gap-3 px-nested py-3">{body}</div>
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
        <p className="mt-1 truncate text-sm tabular-nums text-muted">{hint}</p>
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
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onBlur={() => setOpen(false)}
        aria-label={label ?? "What does this mean?"}
        aria-expanded={open}
        className="relative inline-flex size-4 items-center justify-center text-muted transition hover:text-foreground"
      >
        <span className="absolute -inset-3 md:-inset-1.5" aria-hidden />
        <Info className="relative h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-52 -translate-x-1/2 rounded-lg border border-border bg-raised px-3 py-2.5 text-sm font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

const HAIRLINE_TRACKS =
  "grid-cols-[repeat(var(--sg-m),minmax(0,1fr))] sm:grid-cols-[repeat(var(--sg-d),minmax(0,1fr))]";

function hairlineVars(
  mobile: number,
  desk: number,
  lg?: number
): CSSProperties {
  return {
    "--sg-m": String(mobile),
    "--sg-d": String(desk),
    ...(lg != null ? { "--sg-lg": String(lg) } : {}),
  } as CSSProperties;
}

/**
 * Equal cells, hairline gaps. Column count always divides the children,
 * so the last row never shows an empty box.
 */
export function HairlineGrid({
  children,
  className,
  preferred = 3,
  mobilePreferred,
  lgPreferred,
  fit = "fill",
  role,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  preferred?: number;
  mobilePreferred?: number;
  lgPreferred?: number;
  /** fill = chips (prefer a full row). cards = number tiles (prefer stacking). */
  fit?: "fill" | "cards";
  role?: string;
  ariaLabel?: string;
}) {
  const n = Children.count(children);
  const snap = fit === "cards" ? filledCardColumns : filledGridColumns;
  const mobile = snap(n, mobilePreferred ?? preferred);
  const desk = snap(n, preferred);
  const lg = lgPreferred != null ? snap(n, lgPreferred) : undefined;
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border border-border bg-border",
        HAIRLINE_TRACKS,
        lg != null && "lg:grid-cols-[repeat(var(--sg-lg),minmax(0,1fr))]",
        className
      )}
      style={hairlineVars(mobile, desk, lg)}
    >
      {children}
    </div>
  );
}

/** One box. Hairline columns. Use this for any 2–5 number row. */
export function Scoreboard({
  cols = 4,
  className,
  children,
}: {
  cols?: 1 | 2 | 3 | 4 | 5;
  className?: string;
  children: ReactNode;
}) {
  const n = Children.count(children);
  const desk = filledCardColumns(n, cols);
  const mobilePreferred = cols <= 1 ? 1 : cols === 3 ? 1 : Math.min(2, cols);
  const mobile = filledCardColumns(n, mobilePreferred);
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border border-border bg-border",
        HAIRLINE_TRACKS,
        className
      )}
      style={hairlineVars(mobile, desk)}
    >
      {children}
    </div>
  );
}

type ScoreProps = {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** Short scan lines under the figure. Prefer this over a paragraph `sub`. */
  bullets?: string[];
  explain?: string;
  tone?: "up" | "down";
  valueClassName?: string;
  subClassName?: string;
  bulletsClassName?: string;
  className?: string;
};

function scoreTone(tone?: "up" | "down") {
  if (tone === "up") return "text-gain";
  if (tone === "down") return "text-loss";
  return "text-foreground";
}

/** A cell inside Scoreboard. Same type as Stat. No extra box. */
export function Score({
  label,
  value,
  sub,
  bullets,
  explain,
  tone,
  valueClassName,
  subClassName,
  bulletsClassName,
  className,
}: ScoreProps) {
  const noteClass = cn("mt-1.5 text-sm leading-snug", subClassName ?? "text-muted");
  return (
    <div className={cn(SCORE_CELL, className)}>
      <MicroLabel>
        {label}
        {explain && <InfoTip text={explain} />}
      </MicroLabel>
      <p className={cn(DISPLAY, valueClassName ?? scoreTone(tone))}>
        {value}
      </p>
      {bullets && bullets.length > 0 ? (
        <ul className={cn(noteClass, "space-y-1", bulletsClassName)}>
          {bullets.map((line, i) => (
            <li key={`${i}:${line}`} className="flex gap-1.5">
              <span
                aria-hidden
                className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-current opacity-50"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        sub != null && <p className={noteClass}>{sub}</p>
      )}
    </div>
  );
}

/** One boxed number, when it is not part of a row. */
export function Stat(props: ScoreProps) {
  return (
    <Scoreboard cols={1} className={props.className}>
      <Score {...props} className={undefined} />
    </Scoreboard>
  );
}

/**
 * The one segmented toggle. Overview's today/lifetime, the drawer's 3y/5y,
 * and the scenario picker used to be four hand-rolled copies with three
 * different active states. Labels always paint in full: compact pills size
 * to the words, filled grids wrap instead of ellipsizing.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className,
  columns,
}: {
  options: readonly { id: T; label: string; title?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /**
   * Equal cells that fill the width. The count is snapped so the last
   * row is always full. Omit for a compact inline toggle.
   */
  columns?: number;
}) {
  const fill = columns != null && columns > 0;
  const cols = fill ? filledGridColumns(options.length, columns) : 1;
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        fill
          ? "grid w-full min-w-0 max-w-full gap-px overflow-hidden rounded-lg border border-border bg-border"
          : "inline-flex max-w-full min-w-0 flex-nowrap rounded-lg border border-border bg-well p-0.5",
        className
      )}
      style={
        fill
          ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
          : undefined
      }
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
            "touch-target text-sm font-medium transition disabled:opacity-40 md:min-h-0 md:min-w-0",
            fill
              ? "flex min-w-0 items-center justify-center bg-well px-2 py-2.5"
              : "inline-flex shrink-0 items-center justify-center rounded-md px-2.5 py-1.5 sm:px-3",
            value === o.id
              ? "bg-select text-select-ink"
              : fill
                ? "text-muted hover:bg-hover hover:text-foreground"
                : "text-muted hover:text-foreground"
          )}
        >
          <span
            className={
              fill
                ? "block max-w-full text-center leading-snug break-words"
                : "whitespace-nowrap"
            }
          >
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

const PILL_TONES = {
  neutral: "border-border bg-raised text-foreground/80",
  brand: "border-brand/40 bg-hover text-foreground",
  good: "border-gain/30 bg-gain/10 text-gain",
  warn: "border-caution/40 bg-caution/10 text-foreground",
  bad: "border-loss/40 bg-loss/15 text-loss",
  info: "border-border bg-hover text-foreground",
} as const;

export type PillTone = keyof typeof PILL_TONES;

/** Status chip. Same size as other chrome. Never a bare coloured dot alone. */
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
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium",
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
        "rounded-xl border border-dashed border-border bg-raised px-panel py-10 text-center",
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
