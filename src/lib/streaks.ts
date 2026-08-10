/** Streaks from daily quote moves (session heuristic). */

export type StreakInfo = {
  greenDays: number;
  label: string;
};

export function estimateGreenStreak(
  sparkline: number[] | undefined
): StreakInfo {
  if (!sparkline || sparkline.length < 3) {
    return { greenDays: 0, label: "No streak yet" };
  }
  let streak = 0;
  for (let i = sparkline.length - 1; i > 0; i--) {
    if (sparkline[i]! >= sparkline[i - 1]!) streak += 1;
    else break;
  }
  if (streak >= 5) return { greenDays: streak, label: `${streak}d green run` };
  if (streak >= 2) return { greenDays: streak, label: `${streak}d up days` };
  return { greenDays: streak, label: streak ? `${streak}d up` : "Flat / red" };
}
