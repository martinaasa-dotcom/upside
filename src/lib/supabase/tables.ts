/** Prefixed tables on the shared Upthink Platform Supabase project. */
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
  errorLog: "portfell_error_log",
  margusFund: "portfell_margus_fund",
  margusFundHoldings: "portfell_margus_fund_holdings",
  margusFundReports: "portfell_margus_fund_reports",
  margusFundWeeklyRecaps: "portfell_margus_fund_weekly_recaps",
} as const;

/** Fixed id for the seed test community (Aasad/MaryAnn/Anu/Karud/Lap circle). */
export const UPSIDE_CIRCLE_ID = "a0000000-0000-4000-8000-000000000001";
