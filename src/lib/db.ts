/**
 * IndexedDB helpers for ClipToDict.
 *
 * Two databases:
 *   cliptodict-dict  — bundled dictionary data (JMdict + pitch accent)
 *   cliptodict-deck  — user's saved Vocabulary Cards
 *
 * Issue #2 uses cliptodict-dict only.
 */

const DICT_DB_NAME = 'cliptodict-dict';
const DICT_DB_VERSION = 1;

export const STORE_JMDICT = 'jmdict';
export const STORE_PITCH = 'pitchAccent';

// ─── Open the dictionary DB ───────────────────────────────────────────────────

let _dictDbPromise: Promise<IDBDatabase> | null = null;

export function openDictDb(): Promise<IDBDatabase> {
  if (_dictDbPromise) return _dictDbPromise;

  _dictDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DICT_DB_NAME, DICT_DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // jmdict — keyed by `word`, indexed by `reading`
      if (!db.objectStoreNames.contains(STORE_JMDICT)) {
        const jmStore = db.createObjectStore(STORE_JMDICT, { keyPath: 'word' });
        jmStore.createIndex('reading', 'reading', { unique: false });
      }

      // pitchAccent — keyed by composite `word+reading`
      if (!db.objectStoreNames.contains(STORE_PITCH)) {
        db.createObjectStore(STORE_PITCH, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return _dictDbPromise;
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

/** Put a single record into a store (create or update). */
export function dbPut(db: IDBDatabase, storeName: string, record: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Bulk-put an array of records in a single transaction (much faster than one-by-one). */
export function dbPutBulk(
  db: IDBDatabase,
  storeName: string,
  records: unknown[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    let i = 0;
    function putNext() {
      if (i >= records.length) return;
      const req = store.put(records[i++]);
      req.onsuccess = putNext;
      req.onerror = () => reject(req.error);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    putNext();
  });
}

/** Get a single record by key. Returns undefined if not found. */
export function dbGet<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Count records in a store. */
export function dbCount(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Clear all records in a store. */
export function dbClear(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
