import type { MetadataRoute } from "next";
import { PRIVATE_NOINDEX_PATHS } from "@/lib/seo-routes";
import { siteUrl } from "@/lib/site-url";

const BASE_URL = siteUrl();

/** Most routes are per-account data behind sign-in. Index the public
 * pages only. Authenticated rooms are also tagged noindex in metadata. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/communities$", "/terms", "/privacy"],
      disallow: [
        ...PRIVATE_NOINDEX_PATHS,
        "/communities/",
        "/api/",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
