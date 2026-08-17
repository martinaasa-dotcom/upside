import { clearBookCache } from "@/lib/book-cache";
import { saveLastUser } from "@/lib/last-session";
import { idbWipe } from "@/lib/offline/idb";

const KEEP_EXACT = new Set(["portfell-locked"]);

function keepLocalKey(key: string): boolean {
  if (KEEP_EXACT.has(key)) return true;
  if (key.startsWith("portfell-demo-v")) return true;
  return false;
}

function wipeStorage(storage: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (keepLocalKey(key)) continue;
    if (
      key.startsWith("upside-") ||
      key.startsWith("portfell-") ||
      key.startsWith("sb-")
    ) {
      storage.removeItem(key);
    }
  }
}

/** Drop JWT leftovers, book caches, and IndexedDB. Keeps the demo Save lock. */
export async function purgeClientSession(): Promise<void> {
  saveLastUser(null);
  clearBookCache();
  try {
    wipeStorage(window.localStorage);
  } catch {
    /* private mode */
  }
  try {
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
  await idbWipe();
}

export { keepLocalKey };
