import { OFFLINE_CONFIG } from "@/lib/offline/config";
import type { OfflineReelRecord, OfflineStats } from "@/lib/offline/types";

let databasePromise: Promise<IDBDatabase> | null = null;

export async function requestOfflinePersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_CONFIG.dbName, OFFLINE_CONFIG.dbVersion);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_CONFIG.storeName)) {
        const store = db.createObjectStore(OFFLINE_CONFIG.storeName, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
        store.createIndex("platform", "platform");
        store.createIndex("isFavorite", "isFavorite");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      databasePromise = null;
      reject(req.error ?? new Error("Failed to open offline DB"));
    };
  });
  return databasePromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Offline DB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Offline DB transaction aborted"));
  });
}

function normalizeRecord(row: OfflineReelRecord): OfflineReelRecord {
  return { ...row, pinned: Boolean(row.pinned) };
}

export async function listOfflineReels(): Promise<OfflineReelRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_CONFIG.storeName, "readonly");
    const req = tx.objectStore(OFFLINE_CONFIG.storeName).getAll();
    req.onsuccess = () => {
      const rows = (req.result as OfflineReelRecord[])
        .map(normalizeRecord)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
          return (b.savedAt || "").localeCompare(a.savedAt || "");
        });
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to list offline reels"));
  });
}

export async function getOfflineReel(id: string): Promise<OfflineReelRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_CONFIG.storeName, "readonly");
    const req = tx.objectStore(OFFLINE_CONFIG.storeName).get(id);
    req.onsuccess = () => {
      const row = req.result as OfflineReelRecord | undefined;
      resolve(row ? normalizeRecord(row) : null);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to get offline reel"));
  });
}

export async function putOfflineReel(record: OfflineReelRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(OFFLINE_CONFIG.storeName, "readwrite");
  tx.objectStore(OFFLINE_CONFIG.storeName).put(record);
  await txDone(tx);
}

export async function deleteOfflineReel(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(OFFLINE_CONFIG.storeName, "readwrite");
  tx.objectStore(OFFLINE_CONFIG.storeName).delete(id);
  await txDone(tx);
}

export async function clearOfflineReels(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(OFFLINE_CONFIG.storeName, "readwrite");
  tx.objectStore(OFFLINE_CONFIG.storeName).clear();
  await txDone(tx);
}

export async function getOfflineStats(): Promise<OfflineStats> {
  const rows = await listOfflineReels();
  return {
    count: rows.length,
    totalBytes: rows.reduce((sum, r) => sum + r.byteSize, 0),
    maxBytes: OFFLINE_CONFIG.maxBytes,
  };
}

export async function getOfflineIds(): Promise<Set<string>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_CONFIG.storeName, "readonly");
    const req = tx.objectStore(OFFLINE_CONFIG.storeName).getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result.map(String)));
    req.onerror = () => reject(req.error ?? new Error("Failed to list offline ids"));
  });
}

export async function getOfflinePinnedIds(): Promise<Set<string>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const ids = new Set<string>();
    const tx = db.transaction(OFFLINE_CONFIG.storeName, "readonly");
    const req = tx.objectStore(OFFLINE_CONFIG.storeName).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(ids);
        return;
      }
      const row = cursor.value as OfflineReelRecord;
      if (row.pinned) ids.add(String(cursor.primaryKey));
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to list pinned ids"));
  });
}
