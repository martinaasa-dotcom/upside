"use client";

import { TickerSymbol } from "@/components/TickerSymbol";
import { Badge } from "@/components/ui/badge";
import {
  Card as SurfaceCard,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { filledCardColumns, filledGridColumns } from "@/lib/filled-grid";
import { cn, signedPercent, splitMoveTint } from "@/lib/format";
import { ChevronRight, Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  Children,
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
 *   Radius     shell rounded-xl · nested muted rounded-lg · control rounded-lg
 *   Shell      black field, lifted cards. Primary is violet. Nested is muted.
 *              Green is an up number, not a wash.
 *   Stack      field is bg-background. A box on the field is bg-card.
 *              Floating menus are bg-popover, never muted (muted is hover).
 *              Nested is bg-muted. Never a card inside a card.
 *   Card       ring-1 ring-foreground/10. Nested boxes are muted, no second ring.
 *              Static facts are not nested pills. Use Item, Table, or
 *              SwatchLegend. A filled rounded box reads as a button.
 *   Type scale, the only sizes a person should see. Down a block they
 *   go largest to smallest, never a 24px word between a caption and a
 *   paragraph:
 *   text-2xl   24  page titles, and scoreboard figures that are money
 *                  or a percent. Not a status word.
 *   text-lg    18  panel titles, status words on a reading tile
 *   text-base  16  card titles, tickers
 *   text-sm    14  body, chrome, labels, inputs, buttons, nav, tables
 *   text-xs    12  chart ticks, Badge, kbd shortcuts, listing chips
 *              Chart ticks are HTML (ChartYAxis). Never SVG <text>,
 *              which scales with the viewBox and blows up on a wide screen.
 *              No text-[Npx]. No sm:text-xl jumps on titles.
 *              No text-4xl. The logo lockup is the exception.
 *   Headings   text-lg font-semibold tracking-tight (hero: text-2xl) · sentence case
 *   Type       Geist for titles, body, and labels. Geist Mono for money.
 *   Micro      text-sm font-medium text-muted-foreground · sentence case
 *              Caps stay on the logo only. Micro sits above a figure,
 *              never above a paragraph.
 *   Metrics    A row of numbers is separate cards (Scoreboard) with air
 *              between them (Score, gap-6). Do not nest four Stat tiles in a panel.
 *              Stat is the same cell, used alone. Figures are text-2xl.
 *              A Score with bullets is a reading tile: label text-sm
 *              semibold, status text-lg, bullets text-sm. Do not use
 *              the 24px figure style on a word like "Weakening".
 *              Do not park a paragraph in the sub line.
 *              Do not park unlabeled numbers on the far right of a row.
 *   Reading    a bordered card, quiet label, same type as the page. Thesis
 *              and Worth noticing live in a box. Not a cream slab, and
 *              not loose type on the field.
 *   Body       text-sm leading-relaxed text-muted-foreground for chrome
 *   Floor      reading copy is text-sm. text-xs is ticks, Badge, kbd.
 *   Air        padding and gaps do the explaining. Do not stack a subtitle,
 *              a blurb, and a hint that all say the same thing.
 *   Measure    copy inside a panel fills the panel. Do not pinch it to a
 *              reading column. That leaves a dead strip of empty card and
 *              wraps a sentence for no reason.
 *   Split      title/copy + controls use SPLIT_ROW / SPLIT_COPY /
 *              SPLIT_ACTIONS. Never `flex-wrap` + `min-w-0 flex-1` next to
 *              shrink-0 chrome. On a phone that leftover strip is ~80px
 *              and the sentence wraps one word per line.
 *   Inset      page gutter and panel pad are p-6. Nested
 *              cards are p-6. Score cells use p-6 so the
 *              figures have air. Same on a phone. Do not invent
 *              a second pad. Label to figure is mt-2. InfoTip must
 *              not stretch that row.
 *              A row of numbers is Scoreboard, never a loose
 *              MicroLabel grid with its own padding.
 *   Hairline   gap-px + bg-border grids (Segmented fill,
 *              HairlineGrid) paint every track. The last row must be
 *              full. Never an empty leftover box. Snap columns with
 *              filledGridColumns / filledCardColumns. Do not hand-roll
 *              grid-cols-N on that pattern. Scoreboard is a gap-6 card
 *              grid, not a hairline bar.
 *
 * Sentence case is not cosmetic. "Year-by-Year Target Roadmap" reads like a
 * consultant's slide; "Price path" reads like a person wrote it.
 */

/** Page-level box. shadcn Card shell: ring, not a gold hairline. Glass:
 * translucent + blurred so the ambient page glow shows through. */
export const BOX =
  "card-sheen glass rounded-xl text-sm text-card-foreground ring-1 ring-foreground/10";
/** Nested well inside a box. Not a second card, and not for static facts. */
export const CARD = "glass-well rounded-lg";
/** Panel padding. Comfortable density, same on phone and desktop. */
export const PANEL_PAD = "p-6";
/** Nested card / score-cell padding. Same step as the panel. */
export const NESTED_PAD = "p-6";
/** A Scoreboard cell. Separate card on the field, not a hairline slice. */
export const SCORE_CELL =
  "card-sheen glass min-w-0 rounded-xl p-6 ring-1 ring-foreground/10";
/** Member / row list on the field. */
export const LIST =
  "glass divide-y divide-border overflow-hidden rounded-xl ring-1 ring-foreground/10";
/** Anchored ticker/search menu. Popover fill plus a real edge on black. */
export const SUGGEST_MENU =
  "absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/20";

const SHELL_TONES = {
  default: "card-sheen glass ring-foreground/10",
  plain: "card-sheen glass ring-foreground/10",
  brand: "card-sheen glass ring-primary/20",
  warn: "card-sheen glass ring-warning/35",
  danger: "card-sheen glass ring-destructive/30",
} as const;

const FIGURE =
  "mt-2 font-mono text-2xl font-bold tabular-nums";
const DISPLAY =
  "mt-2 min-w-0 font-mono text-2xl font-bold leading-none tracking-tight tabular-nums whitespace-nowrap";
/** Status word on a reading tile. Not the 24px figure style. */
const STATUS =
  "mt-1.5 min-w-0 font-heading text-lg font-semibold tracking-tight";

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
        "h-full min-w-0 max-w-full rounded-xl text-sm text-card-foreground ring-1",
        SHELL_TONES[tone],
        padded && "flex flex-col gap-6 p-6",
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
    brand: "bg-muted text-muted-foreground",
    violet: "bg-muted text-foreground",
    emerald: "bg-gain/15 text-gain",
    zinc: "bg-muted text-muted-foreground",
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
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
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
              "font-heading font-semibold tracking-tight text-foreground",
              hero ? "text-2xl" : "text-lg"
            )}
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
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
  default: "bg-muted",
  raised: "bg-accent",
  brand: "bg-muted ring-1 ring-primary/20",
  good: "bg-gain/10",
  warn: "bg-warning/10",
  bad: "bg-destructive/10",
  info: "bg-accent",
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
        "rounded-lg",
        NESTED_PAD,
        CARD_TONES[tone],
        interactive &&
          "transition hover:scale-[1.01] hover:bg-accent active:scale-[0.995]",
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
        "flex items-center gap-1 text-sm font-medium text-muted-foreground",
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
  nested = false,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Inside a Panel. No second card ring. */
  nested?: boolean;
}) {
  return (
    <div
      className={cn(
        nested
          ? "glass-well rounded-lg text-foreground"
          : "card-sheen glass rounded-xl text-foreground ring-1 ring-foreground/10",
        "p-6",
        className
      )}
    >
      {label != null && label !== "" ? (
        <div className="text-sm font-semibold tracking-tight text-foreground">
          {label}
        </div>
      ) : null}
      <div
        className={cn(
          label != null && label !== "" && "mt-2",
          "text-sm leading-relaxed text-foreground"
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

/** Ticker + line. Card header + Item (media, title, description, actions). */
export function ScanList({
  label,
  rows,
  onOpen,
  nested = false,
  className,
}: {
  label?: ReactNode;
  rows: { ticker: string; text: string; movePct?: number | null }[];
  onOpen?: (ticker: string) => void;
  /** Inside a Panel. No second card ring. */
  nested?: boolean;
  className?: string;
}) {
  const mixedListings = listingCurrenciesAreMixed(rows);
  const list = (
    <ItemGroup>
      {rows.map((row) => (
        <ScanRow
          key={row.ticker}
          ticker={row.ticker}
          text={row.text}
          movePct={row.movePct}
          mixedListings={mixedListings}
          onOpen={onOpen}
        />
      ))}
    </ItemGroup>
  );

  if (nested) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {label != null && label !== "" ? (
          <p className="text-sm font-semibold tracking-tight text-foreground">
            {label}
          </p>
        ) : null}
        {list}
      </div>
    );
  }

  return (
    <SurfaceCard className={className}>
      {label != null && label !== "" ? (
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardAction>
            <Badge variant="secondary">{rows.length}</Badge>
          </CardAction>
        </CardHeader>
      ) : null}
      <CardContent>{list}</CardContent>
    </SurfaceCard>
  );
}

function ScanMoveIcon({ movePct }: { movePct?: number | null }) {
  if (movePct != null && movePct < 0) return <TrendingDown />;
  if (movePct != null && movePct > 0) return <TrendingUp />;
  return <Minus />;
}

function ScanRow({
  ticker,
  text,
  movePct,
  mixedListings,
  onOpen,
}: {
  ticker: string;
  text: string;
  movePct?: number | null;
  mixedListings: boolean;
  onOpen?: (ticker: string) => void;
}) {
  const hasPct = movePct != null && Number.isFinite(movePct);
  const showMove = hasPct && movePct !== 0;
  const body = (
    <>
      {hasPct ? (
        <ItemMedia
          variant="icon"
          className={cn(
            "size-8 rounded-lg border border-border bg-muted",
            movePct < 0 && "text-loss",
            movePct > 0 && "text-gain"
          )}
        >
          <ScanMoveIcon movePct={movePct} />
        </ItemMedia>
      ) : null}
      <ItemContent>
        <ItemTitle>
          <TickerSymbol ticker={ticker} showCurrency={mixedListings} />
        </ItemTitle>
        <ItemDescription className="line-clamp-none">{text}</ItemDescription>
      </ItemContent>
      {(showMove || onOpen) ? (
        <ItemActions>
          {showMove ? (
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums",
                movePct < 0 && "border-loss/30 bg-loss/10 text-loss",
                movePct > 0 && "border-gain/30 bg-gain/10 text-gain"
              )}
            >
              {signedPercent(movePct)}
            </Badge>
          ) : null}
          {onOpen ? (
            <ChevronRight
              className="size-4 text-muted-foreground transition-transform group-hover/scanrow:translate-x-0.5"
              aria-hidden
            />
          ) : null}
        </ItemActions>
      ) : null}
    </>
  );

  if (onOpen) {
    return (
      <Item
        variant="outline"
        asChild
        className="group/scanrow transition hover:scale-[1.01] hover:bg-muted active:scale-[0.99]"
      >
        <button
          type="button"
          onClick={() => onOpen(ticker)}
          className="cursor-pointer text-left"
        >
          {body}
        </button>
      </Item>
    );
  }

  return <Item variant="outline">{body}</Item>;
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
        <p className="mt-1 truncate text-sm tabular-nums text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Tap-to-open explainer. Portaled so a parent `overflow-hidden` cannot
 * clip it, and Radix keeps it inside the viewport.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label ?? "What does this mean?"}
        className="relative inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="absolute -inset-3.5 lg:-inset-2.5" aria-hidden />
        <Info className="relative h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-64 max-w-[min(16rem,calc(100vw-1.5rem))] text-sm font-normal normal-case leading-relaxed tracking-normal"
      >
        {text}
      </PopoverContent>
    </Popover>
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
        "grid gap-px overflow-hidden rounded-lg bg-border",
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

/**
 * Chart / theme legend. Swatch, label, value. No filled chips, so it
 * does not read as a row of buttons.
 */
export function SwatchLegend({
  items,
  className,
}: {
  items: {
    key: string;
    label: string;
    color: string;
    value: ReactNode;
  }[];
  className?: string;
}) {
  return (
    <ul className={cn("mt-3 flex flex-wrap items-center gap-4", className)}>
      {items.map((item) => (
        <li key={item.key}>
          <Badge variant="outline" className="gap-2 font-normal">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {item.value}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Separate cards with air between them. Use this for any 2–5 number row. */
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
        "grid gap-4",
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
  const reading = Boolean(bullets && bullets.length > 0);
  const noteClass = cn(
    reading ? "mt-3 text-sm leading-relaxed" : "mt-2 text-sm leading-snug",
    subClassName ?? "text-muted-foreground"
  );
  return (
    <div className={cn(SCORE_CELL, className)}>
      {reading ? (
        <p className="flex items-start gap-1.5 text-sm font-semibold tracking-tight text-foreground">
          <span className="min-w-0">{label}</span>
          {explain && <InfoTip text={explain} />}
        </p>
      ) : (
        <MicroLabel className={explain ? "items-start" : undefined}>
          <span className="min-w-0">{label}</span>
          {explain && <InfoTip text={explain} />}
        </MicroLabel>
      )}
      <p
        className={cn(
          reading ? STATUS : DISPLAY,
          valueClassName ?? scoreTone(tone)
        )}
      >
        {value}
      </p>
      {reading && bullets ? (
        <ul className={cn(noteClass, "flex flex-col gap-1", bulletsClassName)}>
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
 * shadcn Tabs default trigger on a ToggleGroup. Muted track, no extra
 * border (outline items inside a bordered well stacked two strokes).
 * Off = muted type. Hover = brighter type + faint wash. On = lifted
 * pill (background, input border, shadow), same as TabsTrigger.
 */
const SEGMENTED_ITEM =
  "rounded-md border border-transparent text-muted-foreground shadow-none group-data-[spacing=0]/toggle-group:rounded-md group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-md group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-md hover:bg-foreground/10 hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:hover:bg-background dark:data-[state=on]:border-input dark:data-[state=on]:bg-input/30 dark:data-[state=on]:text-foreground dark:data-[state=on]:hover:bg-input/30";

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
  look = "grid",
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
  /** grid = hairline table. buttons = separate rounded controls. */
  look?: "grid" | "buttons";
}) {
  const fill = columns != null && columns > 0;
  if (!fill) {
    return (
      <ToggleGroup
        type="single"
        value={value ?? undefined}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        spacing={0}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn("max-w-full min-w-0 bg-muted p-[3px]", className)}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.id}
            value={o.id}
            title={o.title}
            className={cn(
              "min-w-0 flex-1 px-1.5",
              SEGMENTED_ITEM,
              "touch-target md:min-h-0 md:min-w-0"
            )}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  }
  const cols = filledGridColumns(options.length, columns);
  const buttons = look === "buttons";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "grid w-full min-w-0 max-w-full",
        buttons
          ? "gap-2"
          : "gap-px overflow-hidden rounded-lg bg-border",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={disabled}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex min-w-0 items-center justify-center px-2 text-sm font-medium transition-all disabled:opacity-40",
              buttons
                ? "touch-target min-h-9 rounded-lg border"
                : "touch-target py-2.5 md:min-h-0 md:min-w-0",
              on
                ? buttons
                  ? "border-input bg-input/30 text-foreground shadow-sm"
                  : "bg-background text-foreground"
                : buttons
                  ? "border-input bg-transparent text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  : "bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            )}
          >
            <span className="block max-w-full text-center leading-snug break-words">
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PILL_TONES = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  brand: "border-transparent bg-primary text-primary-foreground",
  good: "border-gain/40 bg-gain/20 text-gain",
  warn: "border-caution/50 bg-caution/20 text-caution",
  bad: "border-destructive/40 bg-destructive/20 text-destructive",
  info: "border-border bg-muted text-foreground",
} as const;

export type PillTone = keyof typeof PILL_TONES;

/**
 * Status chip. Same size as Button sm (h-7, text-sm), not the tiny
 * shadcn Badge default (h-5, text-xs). That size is for table metadata.
 * These sit in card headers and have to read at a glance.
 */
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
  const variant =
    tone === "bad" ? "destructive" : tone === "brand" ? "default" : "outline";
  return (
    <Badge
      title={title}
      variant={variant}
      className={cn(
        "h-7 rounded-lg px-2.5 text-sm font-medium [&>svg]:size-3.5!",
        PILL_TONES[tone],
        className
      )}
    >
      {children}
    </Badge>
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
    <Empty
      className={cn(
        "glass flex-none border border-dashed border-border px-8 py-8",
        className
      )}
    >
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
