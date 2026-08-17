import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

const BASE_URL = siteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    {
      url: `${BASE_URL}/login`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/communities`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
