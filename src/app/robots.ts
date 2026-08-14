import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

const BASE_URL = siteUrl();

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
