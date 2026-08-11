export type FearGreedSnapshot = {
  score: number;
  rating: string;
  updatedAt: string;
};

type CnnFearGreedPayload = {
  fear_and_greed?: {
    score?: number;
    rating?: string;
    timestamp?: string;
  };
};

const CNN_URL =
  "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

const CNN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; Upside/1.0; +https://upside-upthink-solutions.vercel.app)",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.cnn.com/markets/fear-and-greed",
  Origin: "https://www.cnn.com",
};

export async function fetchFearGreedIndex(): Promise<FearGreedSnapshot | null> {
  try {
    const res = await fetch(CNN_URL, {
      headers: CNN_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CnnFearGreedPayload;
    const fg = data.fear_and_greed;
    const score = fg?.score;
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    return {
      score: Math.round(score),
      rating: String(fg?.rating ?? ratingForScore(score)),
      updatedAt: fg?.timestamp ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error("CNN Fear & Greed fetch failed", err);
    return null;
  }
}

export function ratingForScore(score: number): string {
  if (score <= 25) return "extreme fear";
  if (score <= 45) return "fear";
  if (score <= 55) return "neutral";
  if (score <= 75) return "greed";
  return "extreme greed";
}

export function fearGreedTone(score: number): "fear" | "neutral" | "greed" {
  if (score <= 45) return "fear";
  if (score >= 56) return "greed";
  return "neutral";
}
