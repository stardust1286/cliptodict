/**
 * Orchestrates the one-time dictionary data install:
 *   1. Download jmdict-eng-common.json.zip → parse → bulk-insert into IndexedDB
 *   2. Download kanjium accents.txt → parse → bulk-insert into IndexedDB
 *
 * Progress is reported via chrome.storage.local so the popup can display it.
 * The routine is idempotent: if both stores are already populated it returns
 * immediately without re-downloading.
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

export async function installDictionary(): Promise<void> {
  const db = await openDictDb();

  // ── Idempotency check ──────────────────────────────────────────────────────
  const [jmCount, pitchCount] = await Promise.all([
    dbCount(db, STORE_JMDICT),
    dbCount(db, STORE_PITCH),
  ]);

  if (jmCount > 0 && pitchCount > 0) {
    console.log('[ClipToDict] Dictionary already installed, skipping download.');
    await setInstallStatus({ phase: 'done' });
    return;
  }

  try {
    // ── Step 1: JMdict ───────────────────────────────────────────────────────
    await setInstallStatus({ phase: 'downloading-jmdict', progress: 0 });

    const { entries: jmEntries } = await downloadAndParseJMdict((pct) => {
      setInstallStatus({ phase: 'downloading-jmdict', progress: pct });
    });

    await setInstallStatus({ phase: 'indexing-jmdict', progress: 0 });
    await bulkInsertChunked(db, STORE_JMDICT, jmEntries, (pct) => {
      setInstallStatus({ phase: 'indexing-jmdict', progress: pct });
    });

    console.log(`[ClipToDict] Indexed ${jmEntries.length} JMdict entries.`);

    // ── Step 2: Kanjium pitch accent ─────────────────────────────────────────
    await setInstallStatus({ phase: 'downloading-pitch', progress: 0 });

    const pitchEntries = await downloadAndParsePitchAccent((pct) => {
      setInstallStatus({ phase: 'downloading-pitch', progress: pct });
    });

    await setInstallStatus({ phase: 'indexing-pitch', progress: 0 });
    await bulkInsertChunked(db, STORE_PITCH, pitchEntries, (pct) => {
      setInstallStatus({ phase: 'indexing-pitch', progress: pct });
    });

    console.log(`[ClipToDict] Indexed ${pitchEntries.length} pitch accent entries.`);

    await setInstallStatus({ phase: 'done' });
    console.log('[ClipToDict] Dictionary install complete.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ClipToDict] Dictionary install failed:', message);
    await setInstallStatus({ phase: 'error', error: message });
    throw err;
  }
}
