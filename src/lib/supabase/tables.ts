/** Prefixed tables on the shared Upthink Platform Supabase project. */
export const PORTFELL_TABLES = {
  portfolios: "portfell_portfolios",
  holdings: "portfell_holdings",
  snapshots: "portfell_book_snapshots",
  labState: "portfell_lab_state",
  shareLinks: "portfell_share_links",
  profiles: "portfell_profiles",
  seedClaims: "portfell_seed_claims",
  communities: "portfell_communities",
  communityMembers: "portfell_community_members",
  communityInvites: "portfell_community_invites",
} as const;

/** Fixed id for the seed test community (Aasad/MaryAnn/Anu/Karud/Lap circle). */
export const UPSIDE_CIRCLE_ID = "a0000000-0000-4000-8000-000000000001";
