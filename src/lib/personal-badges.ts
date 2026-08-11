/**
 * Engagement badges derived from local, per-device state (visit streak +
 * Daily Duel). Deliberately NOT part of the synced `LabBundle.badges` —
 * those are book-wide performance badges everyone on the shared sheet sees
 * the same way; a visit streak is personal to whoever is holding this
 * browser, so it's computed fresh at render time instead of persisted.
 */
import { STREAK_MILESTONES, type VisitStreakState } from "@/lib/visit-streak";
import type { DuelStats } from "@/lib/daily-duel";

export type PersonalBadge = {
  id: string;
  label: string;
  detail: string;
};

export function personalBadges(
  streak: VisitStreakState,
  duel: DuelStats
): PersonalBadge[] {
  const out: PersonalBadge[] = [];

  const bestMilestone = [...STREAK_MILESTONES]
    .filter((m) => streak.longestStreak >= m)
    .pop();
  if (bestMilestone) {
    out.push({
      id: `streak-${bestMilestone}`,
      label: `🔥 ${bestMilestone}-day streak`,
      detail: `Visited ${bestMilestone} Tallinn days in a row at your best (current: ${streak.currentStreak}).`,
    });
  }

  const duelMilestones = [3, 5, 10, 20];
  const bestDuelMilestone = duelMilestones
    .filter((m) => duel.bestStreak >= m)
    .pop();
  if (bestDuelMilestone) {
    out.push({
      id: `duel-streak-${bestDuelMilestone}`,
      label: `⚔️ ${bestDuelMilestone}-win Duel streak`,
      detail: `Called ${bestDuelMilestone} Daily Duels correctly in a row at your best.`,
    });
  }

  if (duel.totalPlayed >= 20) {
    out.push({
      id: "duel-veteran",
      label: "⚔️ Duel veteran",
      detail: `Played 20+ Daily Duels — ${duel.totalCorrect}/${duel.totalPlayed} correct (${Math.round((duel.accuracyPct ?? 0) * 100)}%).`,
    });
  } else if (duel.totalPlayed >= 1 && (duel.accuracyPct ?? 0) >= 0.8 && duel.totalPlayed >= 5) {
    out.push({
      id: "duel-sharpshooter",
      label: "🎯 Sharpshooter",
      detail: `${Math.round((duel.accuracyPct ?? 0) * 100)}% Daily Duel accuracy over ${duel.totalPlayed} plays.`,
    });
  }

  return out;
}
