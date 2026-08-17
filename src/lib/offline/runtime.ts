import {
  readBookCache,
  writeBookCache,
} from "@/lib/book-cache";
import { loadLastUser } from "@/lib/last-session";
import {
  OFFLINE_CACHE_READY,
  persistBookSnapshot,
  persistQuotesSnapshot,
  restoreOfflineSnapshots,
} from "@/lib/offline/snapshots";
import { startSyncQueueListener } from "@/lib/offline/sync-queue";
import { loadCachedQuotes, saveCachedQuotes } from "@/lib/quote-cache";

const SW_URL = "/sw.js";

function productionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!productionBuild()) return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    if ("sync" in reg) {
      const syncReg = reg as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      void syncReg.sync?.register("upside-sync").catch(() => undefined);
    }
  } catch {
    /* registration is best-effort */
  }
}

export async function hydrateFromIndexedDb(): Promise<void> {
  if (typeof window === "undefined") return;
  const uid = loadLastUser()?.id ?? null;
  const liveBook = uid ? readBookCache(uid) : null;
  const liveQuotes = loadCachedQuotes();
  if (liveBook) persistBookSnapshot(liveBook);
  if (Object.keys(liveQuotes.quotes).length > 0) {
    persistQuotesSnapshot({
      savedAt: liveQuotes.savedAt ?? Date.now(),
      quotes: liveQuotes.quotes,
    });
  }

  const { book, quotes } = await restoreOfflineSnapshots();
  let restored = false;
  if (book && !liveBook) {
    writeBookCache(book);
    restored = true;
  }
  if (quotes && Object.keys(loadCachedQuotes().quotes).length === 0) {
    saveCachedQuotes(quotes.quotes);
    restored = true;
  }
  if (restored) {
    window.dispatchEvent(new Event(OFFLINE_CACHE_READY));
  }
}

export function startOfflineRuntime(): () => void {
  void registerServiceWorker();
  void hydrateFromIndexedDb();
  return startSyncQueueListener();
}
