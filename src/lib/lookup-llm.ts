/**
 * LLM-powered lookup functions — Issue #4.
 *
 * getLlmWordData(word, reading, apiKey)  → zhTranslation, jaDefinition, conjugations
 * getLlmSentenceData(sentence, apiKey)   → sentenceTranslation, keyVocabulary
 * getOcrText(imageDataUrl, apiKey)       → extracted Japanese text
 *
 * All functions throw LlmError subclasses (LlmAuthError, LlmRateLimitError,
 * LlmTimeoutError) on failure so callers can display appropriate UI messages.
 */

import { callLLM, callVisionLLM, LlmError } from './llm';

// ─── Return types ─────────────────────────────────────────────────────────────

export interface WordLlmData {
  reading?: string;
  zhTranslation: string;
  jaDefinition: string;
  conjugations: Record<string, string>;
}

export interface SentenceLlmData {
  sentenceTranslation: string;
  keyVocabulary: Array<{ word: string; zhMeaning: string }>;
}

// ─── JSON parsing ─────────────────────────────────────────────────────────────

function parseJsonResponse(raw: string): unknown {
  // LLMs sometimes wrap JSON in ```json … ``` fences — strip them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── getLlmWordData ───────────────────────────────────────────────────────────

function buildWordPrompt(word: string, reading: string): string {
  return `You are a Japanese-Chinese dictionary API. Respond with ONLY a valid JSON object, no markdown, no explanation.

Word: ${word}
Reading hint: ${reading || '(unknown — please provide)'}

Output this exact JSON shape:
{
  "reading": "<hiragana/katakana reading; empty string if word is already kana>",
  "zhTranslation": "<concise Simplified Chinese translation>",
  "jaDefinition": "<one-sentence Japanese monolingual definition ending with 。>",
  "conjugations": {
    "masu": "<ます form>",
    "te": "<て form>",
    "ta": "<た form>",
    "negative": "<ない form>",
    "potential": "<potential form>",
    "volitional": "<volitional form>"
  }
}

Rules:
- reading: hiragana reading of the word (supply even if the reading hint is empty)
- conjugations: fill forms for verbs/adjectives; use {} for nouns and expressions
- Output ONLY the JSON object`;
}

function isWordLlmData(data: unknown): data is WordLlmData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  // reading is optional — responses without it are still valid
  return (
    typeof d.zhTranslation === 'string' &&
    typeof d.jaDefinition === 'string' &&
    typeof d.conjugations === 'object' && d.conjugations !== null
  );
}

/**
 * Given a Japanese word and its reading, returns LLM-powered fields:
 * Chinese translation, Japanese monolingual definition, and conjugations.
 *
 * @example
 *   const data = await getLlmWordData('食べる', 'たべる', apiKey);
 *   // { zhTranslation: '吃', jaDefinition: '食物を...', conjugations: { masu: '食べます', ... } }
 */
export async function getLlmWordData(
  word: string,
  reading: string,
  apiKey: string,
): Promise<WordLlmData> {
  const raw = await callLLM(apiKey, buildWordPrompt(word, reading));

  let parsed: unknown;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    throw new LlmError(`Failed to parse word data JSON: ${raw.slice(0, 100)}`);
  }

  if (!isWordLlmData(parsed)) {
    throw new LlmError(`Unexpected word data shape: ${JSON.stringify(parsed).slice(0, 100)}`);
  }

  // Ensure conjugations values are all strings; drop any non-string entries
  const conjugations: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.conjugations)) {
    if (typeof v === 'string') conjugations[k] = v;
  }

  return {
    reading: typeof parsed.reading === 'string' && parsed.reading.trim() ? parsed.reading.trim() : undefined,
    zhTranslation: parsed.zhTranslation,
    jaDefinition: parsed.jaDefinition,
    conjugations,
  };
}

// ─── getLlmSentenceData ───────────────────────────────────────────────────────

function buildSentencePrompt(sentence: string): string {
  return `You are a Japanese-Chinese translation API. Respond with ONLY a valid JSON object, no markdown, no explanation.

Sentence: ${sentence}

Output this exact JSON shape:
{
  "sentenceTranslation": "<full Chinese translation of the sentence in Simplified Chinese>",
  "keyVocabulary": [
    { "word": "<Japanese word>", "zhMeaning": "<Simplified Chinese meaning>" }
  ]
}

Rules:
- keyVocabulary: 3–6 key words/phrases from the sentence that are interesting or non-trivial
- Output ONLY the JSON object`;
}

function isSentenceLlmData(data: unknown): data is SentenceLlmData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.sentenceTranslation !== 'string') return false;
  if (!Array.isArray(d.keyVocabulary)) return false;
  return d.keyVocabulary.every(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).word === 'string' &&
      typeof (item as Record<string, unknown>).zhMeaning === 'string',
  );
}

/**
 * Given a Japanese sentence, returns a Chinese translation and key vocabulary.
 *
 * @example
 *   const data = await getLlmSentenceData('今日は学校に行きました', apiKey);
 *   // { sentenceTranslation: '今天去了学校。', keyVocabulary: [{ word: '学校', zhMeaning: '学校' }, ...] }
 */
export async function getLlmSentenceData(
  sentence: string,
  apiKey: string,
): Promise<SentenceLlmData> {
  const raw = await callLLM(apiKey, buildSentencePrompt(sentence));

  let parsed: unknown;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    throw new LlmError(`Failed to parse sentence data JSON: ${raw.slice(0, 100)}`);
  }

  if (!isSentenceLlmData(parsed)) {
    throw new LlmError(`Unexpected sentence data shape: ${JSON.stringify(parsed).slice(0, 100)}`);
  }

  return {
    sentenceTranslation: parsed.sentenceTranslation,
    keyVocabulary: parsed.keyVocabulary,
  };
}

// ─── getOcrText ───────────────────────────────────────────────────────────────

const OCR_PROMPT =
  'Extract all Japanese text visible in this image. ' +
  'Return only the extracted text, with no additional explanation or formatting.';

/**
 * Run OCR on a screenshot region (data URL) and return the extracted Japanese text.
 *
 * Uses a vision-capable LLM (Groq llama-4-scout → OpenRouter gemini-flash).
 *
 * @example
 *   const text = await getOcrText(dataUrl, apiKey);
 *   // '今日は晴れです'
 */
export async function getOcrText(imageDataUrl: string, apiKey: string): Promise<string> {
  const result = await callVisionLLM(apiKey, OCR_PROMPT, imageDataUrl);
  return result.trim();
}
