/**
 * Orchestrates the one-time dictionary data install:
 *   1. Download jmdict-eng-common.json.zip → parse → bulk-insert into IndexedDB
 *   2. Download kanjium accents.txt → parse → bulk-insert into IndexedDB
 *
 * Progress is reported via chrome.storage.local so the popup can display it.
 * Each step is independently idempotent/resumable: if a store is already
 * populated its step is skipped, so a worker killed after step 1 completes
 * won't redownload it on the next call. Concurrent calls to
 * installDictionary() (e.g. onInstalled firing alongside the startup resume
 * check) share the same in-flight promise instead of racing.
 */

import {
  openDictDb,
  dbPutBulk,
  dbCount,
  STORE_JMDICT,
  STORE_PITCH,
} from '../db';
import { setInstallStatus } from '../install-status';
import { downloadAndParseJMdict } from './jmdict-parser';
import { downloadAndParsePitchAccent } from './pitch-accent-parser';

/** Chunk size for IndexedDB bulk inserts (keeps the main thread responsive). */
const CHUNK_SIZE = 500;

async function bulkInsertChunked(
  db: IDBDatabase,
  storeName: string,
  records: unknown[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  let inserted = 0;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    await dbPutBulk(db, storeName, chunk);
    inserted += chunk.length;
    onProgress?.(Math.round((inserted / records.length) * 100));
    // Yield to the event loop between chunks
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

// Guards against onInstalled and the service-worker-startup resume check both
// firing installDictionary() concurrently — without this, both would pass the
// idempotency check before either has written any records (TOCTOU), doubling
// the download/parse/insert work and racing their setInstallStatus writes.
let _installPromise: Promise<void> | null = null;

export function installDictionary(): Promise<void> {
  if (_installPromise) return _installPromise;
  _installPromise = runInstall().finally(() => {
    _installPromise = null;
  });
  return _installPromise;
}

async function runInstall(): Promise<void> {
  try {
    const db = await openDictDb();

    // ── Per-step idempotency check ─────────────────────────────────────────
    // Checked independently so a worker killed between steps only redoes the
    // step that didn't finish, rather than re-downloading everything.
    const [jmCount, pitchCount] = await Promise.all([
      dbCount(db, STORE_JMDICT),
      dbCount(db, STORE_PITCH),
    ]);

    if (jmCount > 0 && pitchCount > 0) {
      console.log('[ClipToDict] Dictionary already installed, skipping download.');
      await setInstallStatus({ phase: 'done' });
      return;
    }

    // ── Step 1: JMdict ───────────────────────────────────────────────────────
    if (jmCount > 0) {
      console.log('[ClipToDict] JMdict already indexed, skipping.');
    } else {
      await setInstallStatus({ phase: 'downloading-jmdict', progress: 0 });

      const { entries: jmEntries } = await downloadAndParseJMdict((pct) => {
        setInstallStatus({ phase: 'downloading-jmdict', progress: pct });
      });

      await setInstallStatus({ phase: 'indexing-jmdict', progress: 0 });
      await bulkInsertChunked(db, STORE_JMDICT, jmEntries, (pct) => {
        setInstallStatus({ phase: 'indexing-jmdict', progress: pct });
      });

      console.log(`[ClipToDict] Indexed ${jmEntries.length} JMdict entries.`);
    }

    // ── Step 2: Kanjium pitch accent ─────────────────────────────────────────
    if (pitchCount > 0) {
      console.log('[ClipToDict] Pitch accent already indexed, skipping.');
    } else {
      await setInstallStatus({ phase: 'downloading-pitch', progress: 0 });

      const pitchEntries = await downloadAndParsePitchAccent((pct) => {
        setInstallStatus({ phase: 'downloading-pitch', progress: pct });
      });

      await setInstallStatus({ phase: 'indexing-pitch', progress: 0 });
      await bulkInsertChunked(db, STORE_PITCH, pitchEntries, (pct) => {
        setInstallStatus({ phase: 'indexing-pitch', progress: pct });
      });

      console.log(`[ClipToDict] Indexed ${pitchEntries.length} pitch accent entries.`);
    }

    await setInstallStatus({ phase: 'done' });
    console.log('[ClipToDict] Dictionary install complete.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ClipToDict] Dictionary install failed:', message);
    await setInstallStatus({ phase: 'error', error: message });
    throw err;
  }
}
