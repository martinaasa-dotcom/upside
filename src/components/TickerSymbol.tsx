"use client";

import { listingCurrencyName } from "@/lib/listing-currency";
import { cashtag, cn } from "@/lib/format";

/** Compact listing-currency chip. Same language as the EUR/USD toggle:
 * rounded-md, text-xs, brass border, well fill. Not a sentence after the ticker. */
export function ListingCurrencyChip({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const unit = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(unit)) return null;
  const name = listingCurrencyName(unit);
  return (
    <span
      title={
        name
          ? `This listing's share price is in ${name}`
          : `This listing's share price is in ${unit}`
      }
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md border border-border bg-well/50 px-1.5 text-xs font-semibold leading-none tracking-wide text-muted",
        className
      )}
    >
      {unit}
    </span>
  );
}

export function TickerSymbol({
  ticker,
  currency,
  onOpen,
  className,
}: {
  ticker: string;
  currency?: string | null;
  onOpen?: (ticker: string) => void;
  className?: string;
}) {
  const label = cashtag(ticker);
  const name = onOpen ? (
    <button
      type="button"
      onClick={() => onOpen(ticker)}
      className="hover:text-brand-bright"
    >
      {label}
    </button>
  ) : (
    label
  );

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {name}
      {currency ? <ListingCurrencyChip code={currency} /> : null}
    </span>
  );
}
