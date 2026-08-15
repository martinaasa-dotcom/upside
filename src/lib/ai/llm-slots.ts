/**
 * In-process traffic cop for shared free-tier model quota.
 *
 * Chat answers a person who is waiting. Pulse, Forecast auto-runs, and
 * inbox notes can wait. This is per warm instance, not a global lock, so
 * it will not catch every overlap on Vercel. It still stops the common
 * case: one instance chewing a Pulse sweep while someone is mid-reply.
 */

let chatUntil = 0;
let backgroundInFlight = 0;

const DEFAULT_CHAT_HOLD_MS = 60_000;

export function markChatActive(ms = DEFAULT_CHAT_HOLD_MS) {
  chatUntil = ms <= 0 ? 0 : Date.now() + ms;
}

export function chatIsBusy(): boolean {
  return Date.now() < chatUntil;
}

/** True if this background job may call the model. Pair with endBackgroundLlm. */
export function beginBackgroundLlm(): boolean {
  if (chatIsBusy()) return false;
  if (backgroundInFlight >= 1) return false;
  backgroundInFlight += 1;
  return true;
}

export function endBackgroundLlm() {
  backgroundInFlight = Math.max(0, backgroundInFlight - 1);
}
