export type FearGreedSnapshot = {
  score: number;
  rating: string;
  updatedAt: string;
};

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
