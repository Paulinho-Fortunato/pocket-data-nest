/**
 * Minimal IndexedDB wrapper for the AngoStudy chat history and large texts.
 * localStorage stays for lightweight state (key, stats, profile, cards).
 */
const DB_NAME = "angostudy";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no-idb"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function idbGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDB();
    return await new Promise<T>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? fallback);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return fallback;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Quotas/private mode: keep the app usable, just skip persistence.
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
