// ─── Lookup Result ────────────────────────────────────────────────────────────

export interface LookupResult {
  input: string;           // the original queried text
  type: 'word' | 'sentence';

  // Word fields (populated for word lookups)
  reading?: string;        // hiragana/katakana
  jlptLevel?: 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | null;
  partOfSpeech?: string;
  pitchAccent?: number;    // mora drop position (0 = heiban)
  jaDefinition?: string;   // Japanese monolingual definition (LLM)
  zhTranslation?: string;  // Chinese translation (LLM)
  conjugations?: Record<string, string>; // e.g. { te: '食べて', negative: '食べない' }
  exampleSentences?: Array<{ jp: string; zh: string }>;

  // Sentence fields
  sentenceTranslation?: string; // full Chinese translation (LLM)
  keyVocabulary?: Array<{ word: string; zhMeaning: string }>;

  source: 'full' | 'bundled-only'; // whether LLM was available
}

// ─── Vocabulary Card ──────────────────────────────────────────────────────────

export interface VocabularyCard {
  id: string;              // uuid
  savedAt: string;         // ISO 8601
  input: string;
  type: 'word' | 'sentence';
  reading?: string;
  jlptLevel?: string;
  partOfSpeech?: string;
  pitchAccent?: number;
  jaDefinition?: string;
  zhTranslation?: string;
  conjugations?: Record<string, string>;
  exampleSentences?: Array<{ jp: string; zh: string }>;
  sentenceTranslation?: string;
  keyVocabulary?: Array<{ word: string; zhMeaning: string }>;
}

// ─── JMdict Entry (IndexedDB shape) ──────────────────────────────────────────

export interface JMdictEntry {
  word: string;
  reading: string;
  partOfSpeech: string;
  common: boolean;
}

// ─── Pitch Accent Entry (IndexedDB shape) ────────────────────────────────────

export interface PitchAccentEntry {
  key: string;    // `${word}+${reading}`
  word: string;
  reading: string;
  position: number;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface ExtensionSettings {
  apiKey?: string;
}
