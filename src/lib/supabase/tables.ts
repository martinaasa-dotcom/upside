/**
 * Prefixed tables. Names stay `portfell_*` so existing rows, localStorage
 * locks, and RLS policies survive a move onto a dedicated Upside Lab
 * Supabase project. Isolation is env (URL + keys), not a rename.
 */
export const PORTFELL_TABLES = {
  portfolios: "portfell_portfolios",
  holdings: "portfell_holdings",
  snapshots: "portfell_book_snapshots",
  labState: "portfell_lab_state",
  profiles: "portfell_profiles",
  seedClaims: "portfell_seed_claims",
  communities: "portfell_communities",
  communityMembers: "portfell_community_members",
  communityInvites: "portfell_community_invites",
  portfolioOwners: "portfell_portfolio_owners",
  portfolioInvites: "portfell_portfolio_invites",
  accountAliases: "portfell_account_aliases",
  communityPortfolios: "portfell_community_portfolios",
  communityJoinRequests: "portfell_community_join_requests",
  communityDuels: "portfell_community_duels",
  errorLog: "portfell_error_log",
  margusFund: "portfell_margus_fund",
  margusFundHoldings: "portfell_margus_fund_holdings",
  margusFundReports: "portfell_margus_fund_reports",
  margusFundWeeklyRecaps: "portfell_margus_fund_weekly_recaps",
} as const;

/** Fixed id for the seed test community (Aasad/MaryAnn/Anu/Karud/Lap circle). */
export const UPSIDE_CIRCLE_ID = "a0000000-0000-4000-8000-000000000001";

/** Live book columns. Snapshots still select * so a restore cannot drop a field. */
export const PORTFOLIO_COLUMNS =
  "id, name, slug, sort_order, cash_balance, owner_id, classroom_community_id";
export const HOLDING_COLUMNS =
  "id, portfolio_id, ticker, shares, buy_price, eoy_target, target_call_pct, stock_target_override, sort_order";
