/**
 * Public lookup functions that query the IndexedDB dictionary stores.
 *
 * Issue #2 deliverables:
 *   lookupWord(word)             → JMdictEntry | null
 *   lookupPitchAccent(word, reading) → PitchAccentEntry | null
 */

import { openDictDb, dbGet, STORE_JMDICT, STORE_PITCH } from './db';
import type { JMdictEntry, PitchAccentEntry } from '../types/domain';

// ─── JMdict lookup ────────────────────────────────────────────────────────────

/**
 * Look up a word (kanji form or kana-only) in the JMdict store.
 *
 * Returns the first matching entry, or null if the word is not found.
 *
 * @example
 *   const entry = await lookupWord('食べる');
 *   // { word: '食べる', reading: 'たべる', partOfSpeech: 'Ichidan verb', common: true }
 */
export async function lookupWord(word: string): Promise<JMdictEntry | null> {
  const db = await openDictDb();
  const entry = await dbGet<JMdictEntry>(db, STORE_JMDICT, word);
  return entry ?? null;
}

// ─── Pitch accent lookup ──────────────────────────────────────────────────────

/**
 * Look up pitch accent for a word+reading pair.
 *
 * Returns the entry (which includes the mora drop position), or null.
 *
 * @example
 *   const pa = await lookupPitchAccent('食べる', 'たべる');
 *   // { key: '食べる+たべる', word: '食べる', reading: 'たべる', position: 2 }
 */
export async function lookupPitchAccent(
  word: string,
  reading: string,
): Promise<PitchAccentEntry | null> {
  const db = await openDictDb();
  const key = `${word}+${reading}`;
  const entry = await dbGet<PitchAccentEntry>(db, STORE_PITCH, key);
  return entry ?? null;
}
