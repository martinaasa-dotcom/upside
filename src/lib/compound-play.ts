import {
  calculateCompound,
  type CompoundInputs,
  type CompoundResult,
  type PeriodRow,
} from "@/lib/compound-interest";

export type ShockKind = "none" | "drawdown30" | "flat2y";

export type CompareScenario = {
  id: string;
  label: string;
  tagline: string;
  result: CompoundResult;
  color: string;
};

/** First year where period interest exceeds that year's net contributions. */
export function findTippingYear(yearly: PeriodRow[]): number | null {
  for (const row of yearly) {
    if (row.index <= 0) continue;
    if (row.contributions > 0 && row.interest > row.contributions) {
      return row.index;
    }
    if (row.contributions <= 0 && row.interest > 0 && row.index >= 1) {
      // no deposits — tipping is less meaningful; skip
      continue;
    }
  }
  return null;
}

/** Earliest year balance crosses goal (inclusive). */
export function yearsToGoal(
  yearly: PeriodRow[],
  goal: number
): number | null {
  if (goal <= 0) return null;
  for (const row of yearly) {
    if (row.balance >= goal) return row.index;
  }
  return null;
}

/** Fraction of goal reached (0–1+). */
export function goalProgress(balance: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, balance / goal);
}

/**
 * Apply a shock path, then resume normal compounding.
 * - drawdown30: −30% at end of year 1
 * - flat2y: 0% interest for first 24 months, then resume
 */
export function calculateWithShock(
  inputs: CompoundInputs,
  shock: ShockKind
): CompoundResult {
  if (shock === "none") return calculateCompound(inputs);

  if (shock === "drawdown30") {
    const base = calculateCompound(inputs);
    const year1 = base.yearly.find((y) => y.index === 1);
    if (!year1 || inputs.years < 1) return base;

    const afterCrash = year1.balance * 0.7;
    const remainingYears = Math.max(0, inputs.years - 1);
    // Restart from crashed balance for remaining horizon
    const tail = calculateCompound({
      ...inputs,
      principal: afterCrash,
      years: remainingYears,
      months: remainingYears > 0 ? inputs.months : 0,
    });

    // Stitch yearly: year 0, crashed year 1, then tail years offset
    const yearly: PeriodRow[] = [
      base.yearly[0],
      {
        ...year1,
        balance: afterCrash,
        interest: year1.interest - year1.balance * 0.3,
        accruedInterest: year1.accruedInterest - year1.balance * 0.3,
      },
    ];
    for (const row of tail.yearly) {
      if (row.index === 0) continue;
      yearly.push({
        ...row,
        index: row.index + 1,
        label: `Year ${row.index + 1}`,
      });
    }

    const futureValue = yearly[yearly.length - 1]?.balance ?? afterCrash;
    const totalInterest = futureValue - inputs.principal - Math.max(0, tail.totalContributions + (year1.accruedContributions ?? 0));
    return {
      ...tail,
      principal: inputs.principal,
      futureValue,
      totalInterest,
      totalContributions:
        (year1.accruedContributions ?? 0) + tail.totalContributions,
      totalDeposited:
        inputs.principal +
        Math.max(
          0,
          (year1.accruedContributions ?? 0) + tail.totalContributions
        ),
      allTimeRoR:
        inputs.principal > 0
          ? (futureValue -
              inputs.principal -
              Math.max(
                0,
                (year1.accruedContributions ?? 0) + tail.totalContributions
              )) /
            (inputs.principal +
              Math.max(
                0,
                (year1.accruedContributions ?? 0) + tail.totalContributions
              ))
          : 0,
      durationYears: inputs.years + inputs.months / 12,
      yearly,
      monthly: base.monthly,
    };
  }

  // flat2y: zero rate for 2 years, then normal
  const flatYears = Math.min(2, inputs.years);
  const flat = calculateCompound({
    ...inputs,
    ratePercent: 0,
    years: flatYears,
    months: inputs.years <= 2 ? inputs.months : 0,
  });
  const remaining = Math.max(0, inputs.years - 2);
  if (remaining <= 0 && inputs.years <= 2) return flat;

  const resumePrincipal = flat.yearly[flat.yearly.length - 1]?.balance ?? inputs.principal;
  const tail = calculateCompound({
    ...inputs,
    principal: resumePrincipal,
    years: remaining,
    months: inputs.months,
  });

  const yearly: PeriodRow[] = [...flat.yearly];
  for (const row of tail.yearly) {
    if (row.index === 0) continue;
    yearly.push({
      ...row,
      index: row.index + flatYears,
      label: `Year ${row.index + flatYears}`,
    });
  }

  const futureValue = yearly[yearly.length - 1]?.balance ?? resumePrincipal;
  const totalContributions = flat.totalContributions + tail.totalContributions;
  const totalInterest =
    futureValue - inputs.principal - Math.max(0, totalContributions);

  return {
    ...tail,
    principal: inputs.principal,
    futureValue,
    totalInterest,
    totalContributions,
    totalDeposited: inputs.principal + Math.max(0, totalContributions),
    allTimeRoR:
      inputs.principal + Math.max(0, totalContributions) > 0
        ? totalInterest /
          (inputs.principal + Math.max(0, totalContributions))
        : 0,
    durationYears: inputs.years + inputs.months / 12,
    yearly,
    monthly: flat.monthly,
  };
}

export function buildCompareScenarios(
  inputs: CompoundInputs,
  /** Extra annual % from covered-call premiums (e.g. 6). */
  ccBoostPercent = 6
): CompareScenario[] {
  const years = Math.max(inputs.years, 1);
  const base = { ...inputs, years, compound: "monthly" as const };

  const mattress = calculateCompound({
    ...base,
    ratePercent: 0,
    contributionMode: "none",
    depositAmount: 0,
  });

  const spy = calculateCompound({
    ...base,
    ratePercent: 10,
    ratePeriod: "annual",
    contributionMode: inputs.contributionMode,
  });

  const upsideRate =
    toAnnualPct(inputs) +
    (inputs.contributionMode === "none" ? ccBoostPercent : ccBoostPercent * 0.5);
  const upside = calculateCompound({
    ...base,
    ratePercent: upsideRate,
    ratePeriod: "annual",
  });

  return [
    {
      id: "mattress",
      label: "Mattress",
      tagline: "0% · cash under the bed",
      result: mattress,
      color: "#71717a",
    },
    {
      id: "spy",
      label: "Index-ish",
      tagline: "~10% · long-only beta",
      result: spy,
      color: "#38bdf8",
    },
    {
      id: "upside",
      label: "Upside path",
      tagline: `~${upsideRate.toFixed(0)}% · book + CC juice`,
      result: upside,
      color: "#c5a059",
    },
  ];
}

function toAnnualPct(inputs: CompoundInputs): number {
  const r = inputs.ratePercent;
  switch (inputs.ratePeriod) {
    case "annual":
      return r;
    case "monthly":
      return r * 12;
    case "quarterly":
      return r * 4;
    case "daily":
      return r * 365;
  }
}

export function stayTheCourseInputs(inputs: CompoundInputs): CompoundInputs {
  return {
    ...inputs,
    contributionMode: "none",
    depositAmount: 0,
    withdrawalAmount: 0,
    compound: "monthly",
  };
}

export function storyYears(horizon: number): number[] {
  const candidates = [1, 3, 5, 7, 10, 15, 20, 25, 30];
  const picked = candidates.filter((y) => y <= Math.max(horizon, 1));
  if (!picked.includes(horizon) && horizon > 0) picked.push(horizon);
  return picked.slice(0, 6);
}

export function buildNarrative(result: CompoundResult): string[] {
  const lines: string[] = [];
  const tip = findTippingYear(result.yearly);
  lines.push(
    `Path: ${fmt(result.principal)} → ${fmt(result.futureValue)} over ${formatHorizon(result.durationYears)} — structural compounding, not a straight line.`
  );
  lines.push(
    `Interest does ${fmt(result.totalInterest)} of the heavy lifting (${(result.allTimeRoR * 100).toFixed(0)}% all-time RoR). That’s the thesis validation in the math.`
  );
  if (result.totalContributions > 0) {
    lines.push(
      `You add ${fmt(result.totalContributions)} along the way — deposits are the fuel; compounding is the S-curve${tip ? ` (tips past deposits by year ${tip})` : ""}.`
    );
  } else if (tip == null) {
    lines.push(
      `No fresh deposits — pure compounding. Rough double pace: ~${result.doubleYears}y ${result.doubleMonths}m at this rate. Stay the course through the breathers.`
    );
  }
  if (tip != null) {
    lines.push(
      `Tipping point: year ${tip} — yearly interest first beats what you put in. Money working harder than you; that’s the multi-year edge.`
    );
  }
  const mid = result.yearly.find((y) => y.index === Math.floor(result.durationYears / 2));
  if (mid && mid.index > 0) {
    lines.push(
      `Halfway checkpoint (year ${mid.index}): ${fmt(mid.balance)} already on the books — pullbacks along the way are resets, not thesis breaks.`
    );
  }
  return lines.slice(0, 5);
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatHorizon(years: number): string {
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  if (m <= 0) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y}y ${m}m`;
}

/** Solve roughly how many years to hit goal at rate + optional monthly deposit. */
export function estimateYearsToGoal(opts: {
  principal: number;
  goal: number;
  annualRatePct: number;
  monthlyDeposit: number;
}): number | null {
  const { principal, goal, annualRatePct, monthlyDeposit } = opts;
  if (goal <= principal) return 0;
  if (annualRatePct <= 0 && monthlyDeposit <= 0) return null;

  let balance = principal;
  let deposit = monthlyDeposit;
  const r = annualRatePct / 100 / 12;
  for (let m = 1; m <= 600; m++) {
    balance = balance * (1 + r) + deposit;
    if (m % 12 === 0) deposit *= 1.02; // match default 2% YoY bump
    if (balance >= goal) return Math.ceil(m / 12);
  }
  return null;
}
