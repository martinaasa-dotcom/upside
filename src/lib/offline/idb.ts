/**
 * Tiny IndexedDB wrapper. Open can fail in private mode; every helper
 * swallows that so the rest of the app keeps using localStorage.
 */

const DB_NAME = "upside-offline";
const DB_VERSION = 1;
export const KV_STORE = "kv";
export const QUEUE_STORE = "queue";

let dbPromise: Promise<IDBDatabase> | null = null;

function canUseIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIdb()) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
  });
  return dbPromise;
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  start: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = start(tx.objectStore(storeName));
        let value: T | undefined;
        req.onsuccess = () => {
          value = req.result;
        };
        req.onerror = () => {
          reject(req.error ?? new Error("IndexedDB request failed"));
        };
        tx.oncomplete = () => resolve(value as T);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
      })
  );
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await runRequest(KV_STORE, "readonly", (store) =>
      store.get(key) as IDBRequest<T | undefined>
    );
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await runRequest(KV_STORE, "readwrite", (store) => store.put(value, key));
  } catch {
    /* private mode / quota */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    await runRequest(KV_STORE, "readwrite", (store) => store.delete(key));
  } catch {
    /* ignore */
  }
}

export async function idbQueuePut(value: unknown): Promise<void> {
  try {
    await runRequest(QUEUE_STORE, "readwrite", (store) => store.put(value));
  } catch {
    /* ignore */
  }
}

export async function idbQueueGetAll<T>(): Promise<T[]> {
  try {
    const rows = await runRequest(QUEUE_STORE, "readonly", (store) =>
      store.getAll() as IDBRequest<T[]>
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function idbQueueDelete(id: string): Promise<void> {
  try {
    await runRequest(QUEUE_STORE, "readwrite", (store) => store.delete(id));
  } catch {
    /* ignore */
  }
}

export async function idbQueueClear(): Promise<void> {
  try {
    await runRequest(QUEUE_STORE, "readwrite", (store) => store.clear());
  } catch {
    /* ignore */
  }
}

export async function idbKvClear(): Promise<void> {
  try {
    await runRequest(KV_STORE, "readwrite", (store) => store.clear());
  } catch {
    /* ignore */
  }
}

/** Close the connection and drop the offline DB. Used on sign-out. */
export async function idbWipe(): Promise<void> {
  await idbKvClear();
  await idbQueueClear();
  if (typeof indexedDB === "undefined") return;
  try {
    if (dbPromise) {
      const db = await dbPromise.catch(() => null);
      db?.close();
      dbPromise = null;
    }
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
