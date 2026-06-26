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

// ─── LLM error capture ──────────────────────────────────────────────────────

/**
 * Outcome of an attempted LLM call. We deliberately do NOT swallow failures
 * with `.catch(() => null)`: a rejected key, rate-limit, or timeout must be
 * surfaced to the popup (via `error`) so it can tell the user what went wrong
 * instead of silently looking identical to no-API-key bundled-only mode.
 */
interface LlmOutcome<T> {
  data: T | null;
  error?: string;
}

function settleLlm<T>(promise: Promise<T>): Promise<LlmOutcome<T>> {
  return promise.then(
    (data) => ({ data }),
    (err: unknown) => ({
      data: null,
      error: err instanceof Error ? err.message : 'AI lookup failed.',
    }),
  );
}

// ─── Word path ────────────────────────────────────────────────────────────────

async function lookupWordPath(text: string, apiKey?: string): Promise<LookupResult> {
  // Tatoeba examples are not needed to start the LLM/pitch calls, and the
  // request can take up to its 5s timeout. Kick it off now and overlap it with
  // phase 2 instead of blocking the (much slower) LLM call behind it.
  const examplesPromise = fetchExamples(text);

  // Phase 1: the dictionary reading gates phase 2, so resolve it first.
  const [dictEntry, jlptLevel] = await Promise.all([
    lookupWord(text).catch(() => null),
    Promise.resolve(lookupJlpt(text)),
  ]);

  const dictReading = dictEntry?.reading;

  // Phase 2: pitch accent (needs reading) + LLM (needs reading for best results) — parallel.
  const [pitchEntry, llmOutcome] = await Promise.all([
    dictReading
      ? lookupPitchAccent(text, dictReading).catch(() => null)
      : Promise.resolve(null),
    apiKey
      ? settleLlm(getLlmWordData(text, dictReading ?? '', apiKey))
      : Promise.resolve<LlmOutcome<Awaited<ReturnType<typeof getLlmWordData>>>>({ data: null }),
  ]);

  const llmData = llmOutcome.data;
  const examples = await examplesPromise;

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
    common: dictEntry?.common,
    source: llmData ? 'full' : 'bundled-only',
    llmError: llmOutcome.error,
  };
}

// ─── Sentence path ────────────────────────────────────────────────────────────

async function lookupSentencePath(text: string, apiKey?: string): Promise<LookupResult> {
  if (!apiKey) {
    return { input: text, type: 'sentence', source: 'bundled-only' };
  }

  const { data: llmData, error: llmError } = await settleLlm(getLlmSentenceData(text, apiKey));

  return {
    input: text,
    type: 'sentence',
    sentenceTranslation: llmData?.sentenceTranslation,
    keyVocabulary: llmData?.keyVocabulary,
    source: llmData ? 'full' : 'bundled-only',
    llmError,
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
