import type { MetadataRoute } from "next";

const BASE_URL = "https://upside-upthink-solutions.vercel.app";

/** Most routes are per-account data behind sign-in — nothing generically
 * useful for a crawler to index there, and no reason to invite it. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/terms", "/privacy"],
      disallow: ["/account", "/communities", "/admin", "/upside-portfolio", "/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
