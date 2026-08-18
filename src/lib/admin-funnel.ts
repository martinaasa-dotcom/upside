export type AdminFunnelUser = {
  holding_count?: number;
  last_sign_in_at?: string | null;
  last_advisor_at?: string | null;
  portfolios?: unknown[] | null;
};

export type AdminFunnel = {
  signedIn: number;
  hasSheet: number;
  hasHoldings: number;
  usedAdvisor: number;
  returned7d: number;
  activated: number;
};

function inLastWeek(iso: string | null | undefined, weekAgoMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= weekAgoMs;
}

export function funnelFromUsers(
  users: AdminFunnelUser[],
  nowMs = Date.now()
): AdminFunnel {
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const signedIn = users.length;
  const hasSheet = users.filter((u) => (u.portfolios?.length ?? 0) > 0).length;
  const hasHoldings = users.filter((u) => (u.holding_count ?? 0) > 0).length;
  const usedAdvisor = users.filter((u) => Boolean(u.last_advisor_at)).length;
  const returned7d = users.filter((u) =>
    inLastWeek(u.last_sign_in_at, weekAgo)
  ).length;
  const activated = users.filter((u) => {
    if ((u.holding_count ?? 0) <= 0) return false;
    return inLastWeek(u.last_sign_in_at, weekAgo);
  }).length;
  return {
    signedIn,
    hasSheet,
    hasHoldings,
    usedAdvisor,
    returned7d,
    activated,
  };
}
