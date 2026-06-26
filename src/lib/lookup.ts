/**
 * Full Lookup Pipeline — Issue #6.
 *
 * lookup(text, apiKey?) → LookupResult
 *
 * Word path:  JMdict + JLPT + Tatoeba in parallel, then pitch accent + LLM
 *             in parallel (reading is needed by both, so they run in phase 2).
 * Sentence path: LLM translation + key vocabulary.
 * Bundled-only: when no apiKey is supplied, LLM calls are skipped and
 *               source is set to 'bundled-only'.
 */

import { lookupWord, lookupPitchAccent } from './lookup-dict';
import { lookupJlpt } from './jlpt';
import { fetchExamples } from './tatoeba';
import { getLlmWordData, getLlmSentenceData } from './lookup-llm';
import type { LookupResult } from '../types/domain';

// Particles that strongly signal this is a sentence rather than a standalone word.
const SENTENCE_PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も']);

function isSentence(text: string): boolean {
  if (text.length > 8) return true;
  // Only apply particle heuristic for text ≥ 5 chars; shorter strings are almost
  // always standalone words (e.g. いずれも contains も but is a single word).
  if (text.length >= 5) {
    for (const ch of text) {
      if (SENTENCE_PARTICLES.has(ch)) return true;
    }
  }
  return false;
}

// ─── Word path ────────────────────────────────────────────────────────────────

async function lookupWordPath(text: string, apiKey?: string): Promise<LookupResult> {
  // Phase 1: lookups that don't need the reading — all in parallel.
  const [dictEntry, jlptLevel, examples] = await Promise.all([
    lookupWord(text).catch(() => null),
    Promise.resolve(lookupJlpt(text)),
    fetchExamples(text),
  ]);

  const dictReading = dictEntry?.reading;

  // Phase 2: pitch accent (needs reading) + LLM (needs reading for best results) — parallel.
  const [pitchEntry, llmData] = await Promise.all([
    dictReading
      ? lookupPitchAccent(text, dictReading).catch(() => null)
      : Promise.resolve(null),
    apiKey
      ? getLlmWordData(text, dictReading ?? '', apiKey).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Use the dictionary reading when available; fall back to the LLM-supplied reading
  // for words the dictionary doesn't know (loan words, proper nouns, etc.).
  const reading = dictReading ?? llmData?.reading;

  return {
    input: text,
    type: 'word',
    reading,
    jlptLevel,
    partOfSpeech: dictEntry?.partOfSpeech,
    pitchAccent: pitchEntry?.position,
    zhTranslation: llmData?.zhTranslation,
    jaDefinition: llmData?.jaDefinition,
    conjugations: llmData?.conjugations,
    exampleSentences: examples.length > 0 ? examples : undefined,
    source: llmData ? 'full' : 'bundled-only',
  };
}

// ─── Sentence path ────────────────────────────────────────────────────────────

async function lookupSentencePath(text: string, apiKey?: string): Promise<LookupResult> {
  if (!apiKey) {
    return { input: text, type: 'sentence', source: 'bundled-only' };
  }

  const llmData = await getLlmSentenceData(text, apiKey).catch(() => null);

  return {
    input: text,
    type: 'sentence',
    sentenceTranslation: llmData?.sentenceTranslation,
    keyVocabulary: llmData?.keyVocabulary,
    source: llmData ? 'full' : 'bundled-only',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Perform a full lookup for a Japanese word or sentence.
 *
 * @param text    The word, phrase, or sentence to look up.
 * @param apiKey  Optional user API key. When absent, only bundled data is used.
 *
 * @example
 *   await lookup('食べる', key)          // word path — full result
 *   await lookup('今日は学校に行きました', key) // sentence path — translation + vocab
 *   await lookup('食べる')              // word path — bundled-only (no LLM)
 */
export async function lookup(text: string, apiKey?: string): Promise<LookupResult> {
  const input = text.trim();
  return isSentence(input)
    ? lookupSentencePath(input, apiKey)
    : lookupWordPath(input, apiKey);
}
