import { siteUrl } from "@/lib/site-url";
import {
  isMarketCircuitOpen,
  marketFetch,
} from "@/lib/market/circuit-breaker";
import { cnnFearGreedSchema } from "@/lib/market/quote-sanitize";
import {
  ratingForScore,
  type FearGreedSnapshot,
} from "@/lib/market/fear-greed";

const CNN_URL =
  "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

const CNN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; UpsideLab/1.0; +" + siteUrl() + ")",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.cnn.com/markets/fear-and-greed",
  Origin: "https://www.cnn.com",
};

let lastFearGreed: FearGreedSnapshot | null = null;

export async function fetchFearGreedIndex(): Promise<FearGreedSnapshot | null> {
  if (isMarketCircuitOpen("cnn-fear-greed")) {
    return lastFearGreed;
  }
  try {
    const res = await marketFetch("cnn-fear-greed", CNN_URL, {
      headers: CNN_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return lastFearGreed;
    const parsed = cnnFearGreedSchema.safeParse(await res.json());
    if (!parsed.success) return lastFearGreed;
    const fg = parsed.data.fear_and_greed;
    const score = fg?.score;
    if (typeof score !== "number" || !Number.isFinite(score)) return lastFearGreed;
    if (score < 0 || score > 100) return lastFearGreed;
    const snap: FearGreedSnapshot = {
      score: Math.round(score),
      rating: String(fg?.rating ?? ratingForScore(score)),
      updatedAt: fg?.timestamp ?? new Date().toISOString(),
    };
    lastFearGreed = snap;
    return snap;
  } catch (err) {
    console.error("CNN Fear & Greed fetch failed", err);
    return lastFearGreed;
  }
}
