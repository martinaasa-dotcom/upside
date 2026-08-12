import {
  cyclePhaseForYear,
  cyclePhaseLabel,
  presidentForYear,
  type PresidentialCyclePhase,
  type PresidencyTerm,
} from "@/lib/market/presidency";

export type DailyBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type HourBar = {
  date: string;
  /** Hour in US/Eastern (0–23). */
  hourEt: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type YearReturnRow = {
  year: number;
  returnPct: number;
  president: string | null;
  presidentId: string | null;
  party: "D" | "R" | null;
  cyclePhase: PresidentialCyclePhase;
  cycleLabel: string;
};

export type PresidencyReturnRow = {
  president: string;
  presidentId: string;
  party: "D" | "R";
  years: number;
  avgReturnPct: number;
  totalReturnPct: number;
};

export type CyclePhaseReturnRow = {
  phase: PresidentialCyclePhase;
  label: string;
  years: number;
  avgReturnPct: number;
};

export type MonthSeasonRow = {
  month: number;
  label: string;
  avgReturnPct: number;
  winRate: number;
  samples: number;
};

export type DayOfYearRow = {
  /** 1 = Jan 1 … 366 = Dec 31 (leap). */
  dayOfYear: number;
  month: number;
  day: number;
  label: string;
  avgReturnPct: number;
  samples: number;
};

export type IntradayBucketRow = {
  hourEt: number;
  label: string;
  highSharePct: number;
  lowSharePct: number;
  samples: number;
};

export type SeasonalityModel = {
  ticker: string;
  from: string;
  to: string;
  tradingDays: number;
  yearReturns: YearReturnRow[];
  presidencyReturns: PresidencyReturnRow[];
  cycleReturns: CyclePhaseReturnRow[];
  monthlySeason: MonthSeasonRow[];
  dayOfYearSeason: DayOfYearRow[];
  intradayHighLow: IntradayBucketRow[];
  intradaySampleDays: number;
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function dailyReturn(prevClose: number, close: number): number | null {
  if (prevClose <= 0 || close <= 0) return null;
  return (close / prevClose - 1) * 100;
}

function dayOfYearFromDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y!, 0, 0);
  const cur = Date.UTC(y!, m! - 1, d!);
  return Math.floor((cur - start) / 86400000);
}

function formatMonthDay(month: number, day: number): string {
  return `${MONTH_NAMES[month - 1]!} ${day}`;
}

/** Calendar-year total return from first to last session in that year. */
export function computeYearReturns(bars: DailyBar[]): YearReturnRow[] {
  const byYear = new Map<number, DailyBar[]>();
  for (const bar of bars) {
    const year = Number(bar.date.slice(0, 4));
    const list = byYear.get(year) ?? [];
    list.push(bar);
    byYear.set(year, list);
  }

  const rows: YearReturnRow[] = [];
  for (const [year, list] of byYear) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < 2) continue;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const ret = dailyReturn(first.open, last.close);
    if (ret == null) continue;
    const term = presidentForYear(year);
    const phase = cyclePhaseForYear(year);
    rows.push({
      year,
      returnPct: Math.round(ret * 100) / 100,
      president: term?.president ?? null,
      presidentId: term?.id ?? null,
      party: term?.party ?? null,
      cyclePhase: phase,
      cycleLabel: cyclePhaseLabel(phase),
    });
  }
  return rows.sort((a, b) => a.year - b.year);
}

export function computePresidencyReturns(
  yearReturns: YearReturnRow[]
): PresidencyReturnRow[] {
  const map = new Map<
    string,
    { term: PresidencyTerm; returns: number[] }
  >();

  for (const row of yearReturns) {
    if (!row.presidentId || !row.president || !row.party) continue;
    const prev = map.get(row.presidentId);
    if (prev) {
      prev.returns.push(row.returnPct);
    } else {
      map.set(row.presidentId, {
        term: {
          id: row.presidentId,
          president: row.president,
          party: row.party,
          start: "",
          end: null,
        },
        returns: [row.returnPct],
      });
    }
  }

  return [...map.values()]
    .map(({ term, returns }) => {
      const avg =
        returns.reduce((s, r) => s + r, 0) / Math.max(returns.length, 1);
      const compound = returns.reduce((acc, r) => acc * (1 + r / 100), 1);
      return {
        president: term.president,
        presidentId: term.id,
        party: term.party,
        years: returns.length,
        avgReturnPct: Math.round(avg * 100) / 100,
        totalReturnPct: Math.round((compound - 1) * 10000) / 100,
      };
    })
    .sort((a, b) => a.presidentId.localeCompare(b.presidentId));
}

export function computeCycleReturns(
  yearReturns: YearReturnRow[]
): CyclePhaseReturnRow[] {
  const order: PresidentialCyclePhase[] = [
    "post_election",
    "midterm",
    "pre_election",
    "election",
  ];
  const buckets = new Map<PresidentialCyclePhase, number[]>();
  for (const phase of order) buckets.set(phase, []);

  for (const row of yearReturns) {
    buckets.get(row.cyclePhase)?.push(row.returnPct);
  }

  return order.map((phase) => {
    const vals = buckets.get(phase) ?? [];
    const avg =
      vals.length > 0
        ? vals.reduce((s, v) => s + v, 0) / vals.length
        : 0;
    return {
      phase,
      label: cyclePhaseLabel(phase),
      years: vals.length,
      avgReturnPct: Math.round(avg * 100) / 100,
    };
  });
}

export function computeMonthlySeason(bars: DailyBar[]): MonthSeasonRow[] {
  const buckets = Array.from({ length: 12 }, () => [] as number[]);

  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!;
    const cur = bars[i]!;
    const ret = dailyReturn(prev.close, cur.close);
    if (ret == null) continue;
    const month = Number(cur.date.slice(5, 7));
    if (month >= 1 && month <= 12) buckets[month - 1]!.push(ret);
  }

  return buckets.map((vals, idx) => {
    const avg =
      vals.length > 0
        ? vals.reduce((s, v) => s + v, 0) / vals.length
        : 0;
    const wins = vals.filter((v) => v > 0).length;
    return {
      month: idx + 1,
      label: MONTH_NAMES[idx]!,
      avgReturnPct: Math.round(avg * 1000) / 1000,
      winRate:
        vals.length > 0
          ? Math.round((wins / vals.length) * 1000) / 10
          : 0,
      samples: vals.length,
    };
  });
}

/** Average daily return for each calendar day-of-year (Jan 1 … Dec 31). */
export function computeDayOfYearSeason(bars: DailyBar[]): DayOfYearRow[] {
  const buckets = new Map<number, number[]>();

  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!;
    const cur = bars[i]!;
    const ret = dailyReturn(prev.close, cur.close);
    if (ret == null) continue;
    const doy = dayOfYearFromDate(cur.date);
    const list = buckets.get(doy) ?? [];
    list.push(ret);
    buckets.set(doy, list);
  }

  const rows: DayOfYearRow[] = [];
  for (const [dayOfYear, vals] of buckets) {
    const avg =
      vals.reduce((s, v) => s + v, 0) / Math.max(vals.length, 1);
    const month = Number(
      new Date(Date.UTC(2024, 0, dayOfYear)).getUTCMonth() + 1
    );
    const day = Number(new Date(Date.UTC(2024, 0, dayOfYear)).getUTCDate());
    rows.push({
      dayOfYear,
      month,
      day,
      label: formatMonthDay(month, day),
      avgReturnPct: Math.round(avg * 10000) / 10000,
      samples: vals.length,
    });
  }
  return rows.sort((a, b) => a.dayOfYear - b.dayOfYear);
}

/** Which ET hour tends to print the session high / low (from 1h bars). */
export function computeIntradayHighLow(
  hourBars: HourBar[]
): { buckets: IntradayBucketRow[]; sampleDays: number } {
  const byDay = new Map<string, HourBar[]>();
  for (const bar of hourBars) {
    const list = byDay.get(bar.date) ?? [];
    list.push(bar);
    byDay.set(bar.date, list);
  }

  const highCounts = new Map<number, number>();
  const lowCounts = new Map<number, number>();
  let sampleDays = 0;

  for (const dayBars of byDay.values()) {
    if (dayBars.length < 3) continue;
    const sorted = [...dayBars].sort((a, b) => a.hourEt - b.hourEt);
    let highBar = sorted[0]!;
    let lowBar = sorted[0]!;
    for (const bar of sorted) {
      if (bar.high >= highBar.high) highBar = bar;
      if (bar.low <= lowBar.low) lowBar = bar;
    }
    highCounts.set(
      highBar.hourEt,
      (highCounts.get(highBar.hourEt) ?? 0) + 1
    );
    lowCounts.set(lowBar.hourEt, (lowCounts.get(lowBar.hourEt) ?? 0) + 1);
    sampleDays++;
  }

  const hours = [...new Set([...highCounts.keys(), ...lowCounts.keys()])].sort(
    (a, b) => a - b
  );

  const buckets: IntradayBucketRow[] = hours.map((hourEt) => {
    const highs = highCounts.get(hourEt) ?? 0;
    const lows = lowCounts.get(hourEt) ?? 0;
    return {
      hourEt,
      label: formatHourEt(hourEt),
      highSharePct:
        sampleDays > 0
          ? Math.round((highs / sampleDays) * 1000) / 10
          : 0,
      lowSharePct:
        sampleDays > 0
          ? Math.round((lows / sampleDays) * 1000) / 10
          : 0,
      samples: sampleDays,
    };
  });

  return { buckets, sampleDays };
}

function formatHourEt(hour: number): string {
  const h = hour % 12 || 12;
  const suffix = hour < 12 ? "am" : "pm";
  return `${h}${suffix} ET`;
}

export function buildSeasonalityModel(input: {
  ticker: string;
  daily: DailyBar[];
  hourly: HourBar[];
}): SeasonalityModel {
  const daily = [...input.daily].sort((a, b) => a.date.localeCompare(b.date));
  const yearReturns = computeYearReturns(daily);
  const { buckets, sampleDays } = computeIntradayHighLow(input.hourly);

  return {
    ticker: input.ticker,
    from: daily[0]?.date ?? "",
    to: daily[daily.length - 1]?.date ?? "",
    tradingDays: daily.length,
    yearReturns,
    presidencyReturns: computePresidencyReturns(yearReturns),
    cycleReturns: computeCycleReturns(yearReturns),
    monthlySeason: computeMonthlySeason(daily),
    dayOfYearSeason: computeDayOfYearSeason(daily),
    intradayHighLow: buckets,
    intradaySampleDays: sampleDays,
  };
}
