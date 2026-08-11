export type Portfolio = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  cash_balance: number;
  /**
   * Primary/creator owner (legacy column). Authorization uses
   * portfell_portfolio_owners — see coOwnerIds when present.
   */
  owner_id?: string | null;
  /** Co-owner user ids when API includes them. */
  coOwnerIds?: string[];
};

export type Holding = {
  id: string;
  portfolio_id: string;
  ticker: string;
  shares: number;
  buy_price: number;
  eoy_target: number | null;
  target_call_pct: number;
  /** Manual Stock Target override; null = use resistance model */
  stock_target_override: number | null;
  sort_order: number;
};

export type Quote = {
  ticker: string;
  /** Regular-session last (or best available when session closed) */
  price: number;
  change: number;
  /** Fraction, e.g. 0.015 = +1.5% */
  changePercent: number;
  previousClose: number;
  sparkline: number[];
  /** Yahoo marketState: PREPRE | PRE | REGULAR | POST | POSTPOST | CLOSED | … */
  marketState: string | null;
  preMarketPrice: number | null;
  preMarketChange: number | null;
  /** Fraction */
  preMarketChangePercent: number | null;
  postMarketPrice: number | null;
  postMarketChange: number | null;
  /** Fraction */
  postMarketChangePercent: number | null;
};

export type OptionCandidate = {
  ticker: string;
  expiration: string;
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  otmPct: number;
  yield2w: number;
  premium: number;
  contracts: number;
  daysToExpiry: number;
  /** Resistance / local-high used as stock target */
  stockTarget: number;
  /** (stockTarget - spot) / spot */
  targetDistance: number;
};

export type EnrichedHolding = Holding & {
  quote: Quote | null;
  buyValue: number;
  currentValue: number;
  roiPct: number;
  roiDollar: number;
  pctOfTotal: number;
};

/** Unified covered-call / yield row */
export type CoveredCallRow = {
  holding: Holding;
  spot: number;
  totalValue: number;
  yield2w: number | null;
  premium: number | null;
  targetCall: number;
  stockTarget: number | null;
  targetDistance: number | null;
  nextStrike: number | null;
  expiration: string | null;
  contracts: number;
  option: OptionCandidate | null;
};

export type PortfolioSnapshot = {
  portfolio: Portfolio;
  holdings: EnrichedHolding[];
  coveredCallRows: CoveredCallRow[];
  totals: {
    buyValue: number;
    currentValue: number;
    roiDollar: number;
    roiPct: number;
    yield2wAvg: number;
    premiumTotal: number;
    unrealizedProfits: number;
  };
};
