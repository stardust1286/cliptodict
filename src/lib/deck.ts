import type { LookupResult, VocabularyCard } from '../types/domain';

const DB_NAME = 'cliptodict-deck';
const DB_VERSION = 1;
const STORE_NAME = 'cards';

// ─── Open deck DB ─────────────────────────────────────────────────────────────

let _deckDbPromise: Promise<IDBDatabase> | null = null;

function openDeckDb(): Promise<IDBDatabase> {
  if (_deckDbPromise) return _deckDbPromise;

  _deckDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return _deckDbPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Creates a VocabularyCard from a LookupResult and persists it to IndexedDB. */
export async function saveCard(result: LookupResult): Promise<VocabularyCard> {
  const card: VocabularyCard = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    input: result.input,
    type: result.type,
    reading: result.reading,
    jlptLevel: result.jlptLevel ?? undefined,
    partOfSpeech: result.partOfSpeech,
    pitchAccent: result.pitchAccent,
    jaDefinition: result.jaDefinition,
    zhTranslation: result.zhTranslation,
    conjugations: result.conjugations,
    exampleSentences: result.exampleSentences,
    sentenceTranslation: result.sentenceTranslation,
    keyVocabulary: result.keyVocabulary,
  };

  const db = await openDeckDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(card);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return card;
}

/** Returns all cards sorted by savedAt descending (most recent first). */
export async function getCards(): Promise<VocabularyCard[]> {
  const db = await openDeckDb();

  const cards = await new Promise<VocabularyCard[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as VocabularyCard[]);
    req.onerror = () => reject(req.error);
  });

  return cards.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Deletes a card by id. */
export async function deleteCard(id: string): Promise<void> {
  const db = await openDeckDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Clears all cards from the deck. */
export async function clearAllCards(): Promise<void> {
  const db = await openDeckDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/** RFC 4180 CSV escaping: wrap in quotes if the field contains commas, quotes, or newlines. */
function escapeField(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Pitch accent → string (kept distinct from '' so mora 0 / heiban is not lost). */
function formatPitch(pitch: number | undefined): string {
  return pitch === undefined ? '' : String(pitch);
}

/** Conjugations map → "form:value|form:value". */
function formatConjugations(conjugations: Record<string, string> | undefined): string {
  if (!conjugations) return '';
  return Object.entries(conjugations)
    .map(([form, value]) => `${form}:${value}`)
    .join('|');
}

/** Example sentences → "jp / zh|jp / zh". */
function formatExamples(examples: Array<{ jp: string; zh: string }> | undefined): string {
  if (!examples) return '';
  return examples.map((ex) => `${ex.jp} / ${ex.zh}`).join('|');
}

/** Key vocabulary → "word:zhMeaning|word:zhMeaning". */
function formatKeyVocab(vocab: Array<{ word: string; zhMeaning: string }> | undefined): string {
  if (!vocab) return '';
  return vocab.map((v) => `${v.word}:${v.zhMeaning}`).join('|');
}

/**
 * Synchronously converts an array of VocabularyCard objects to a CSV string.
 *
 * Emits every field PRD F7 requires — reading, JLPT level, part-of-speech,
 * pitch accent, Chinese translation, Japanese definition, conjugations, and
 * example sentences (pipe-separated) — plus the sentence-path fields and
 * bookkeeping columns (id, savedAt, type).
 */
export function exportCsv(cards: VocabularyCard[]): string {
  const headers = [
    'id',
    'savedAt',
    'type',
    'input',
    'reading',
    'jlptLevel',
    'partOfSpeech',
    'pitchAccent',
    'zhTranslation',
    'jaDefinition',
    'conjugations',
    'exampleSentences',
    'sentenceTranslation',
    'keyVocabulary',
  ];

  const rows = cards.map((card) => [
    escapeField(card.id),
    escapeField(card.savedAt),
    escapeField(card.type),
    escapeField(card.input),
    escapeField(card.reading),
    escapeField(card.jlptLevel),
    escapeField(card.partOfSpeech),
    escapeField(formatPitch(card.pitchAccent)),
    escapeField(card.zhTranslation),
    escapeField(card.jaDefinition),
    escapeField(formatConjugations(card.conjugations)),
    escapeField(formatExamples(card.exampleSentences)),
    escapeField(card.sentenceTranslation),
    escapeField(formatKeyVocab(card.keyVocabulary)),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}
