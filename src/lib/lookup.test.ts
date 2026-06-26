import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookup } from './lookup';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./lookup-dict', () => ({
  lookupWord: vi.fn(),
  lookupPitchAccent: vi.fn(),
}));

vi.mock('./jlpt', () => ({
  lookupJlpt: vi.fn(),
}));

vi.mock('./tatoeba', () => ({
  fetchExamples: vi.fn(),
}));

vi.mock('./lookup-llm', () => ({
  getLlmWordData: vi.fn(),
  getLlmSentenceData: vi.fn(),
}));

// ─── Typed mock handles ───────────────────────────────────────────────────────

import { lookupWord, lookupPitchAccent } from './lookup-dict';
import { lookupJlpt } from './jlpt';
import { fetchExamples } from './tatoeba';
import { getLlmWordData, getLlmSentenceData } from './lookup-llm';

const mockLookupWord      = vi.mocked(lookupWord);
const mockLookupPitch     = vi.mocked(lookupPitchAccent);
const mockLookupJlpt      = vi.mocked(lookupJlpt);
const mockFetchExamples   = vi.mocked(fetchExamples);
const mockGetLlmWord      = vi.mocked(getLlmWordData);
const mockGetLlmSentence  = vi.mocked(getLlmSentenceData);

// ─── Default stubs (can be overridden per test) ───────────────────────────────

const DICT_ENTRY = { word: '食べる', reading: 'たべる', partOfSpeech: 'Ichidan verb', common: true };
const PITCH_ENTRY = { key: '食べる+たべる', word: '食べる', reading: 'たべる', position: 2 };
const EXAMPLES = [{ jp: '私は毎日食べる。', zh: '我每天吃饭。' }];
const LLM_WORD_DATA = {
  zhTranslation: '吃',
  jaDefinition: '食物を口に入れて飲み込む。',
  conjugations: { masu: '食べます', te: '食べて', negative: '食べない' },
};
const LLM_SENTENCE_DATA = {
  sentenceTranslation: '今天去了学校。',
  keyVocabulary: [
    { word: '学校', zhMeaning: '学校' },
    { word: '行きました', zhMeaning: '去了' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLookupWord.mockResolvedValue(DICT_ENTRY);
  mockLookupPitch.mockResolvedValue(PITCH_ENTRY);
  mockLookupJlpt.mockReturnValue('N5');
  mockFetchExamples.mockResolvedValue(EXAMPLES);
  mockGetLlmWord.mockResolvedValue(LLM_WORD_DATA);
  mockGetLlmSentence.mockResolvedValue(LLM_SENTENCE_DATA);
});

// ─── Word path — full result ──────────────────────────────────────────────────

describe('lookup — word path', () => {
  it('returns a complete LookupResult for a short word with all sources', async () => {
    const result = await lookup('食べる', 'gsk_test');

    expect(result.input).toBe('食べる');
    expect(result.type).toBe('word');
    expect(result.reading).toBe('たべる');
    expect(result.jlptLevel).toBe('N5');
    expect(result.partOfSpeech).toBe('Ichidan verb');
    expect(result.pitchAccent).toBe(2);
    expect(result.zhTranslation).toBe('吃');
    expect(result.jaDefinition).toBe('食物を口に入れて飲み込む。');
    expect(result.conjugations).toEqual({ masu: '食べます', te: '食べて', negative: '食べない' });
    expect(result.exampleSentences).toEqual(EXAMPLES);
    expect(result.source).toBe('full');
  });

  it('calls lookupPitchAccent with the reading from lookupWord', async () => {
    await lookup('食べる', 'gsk_test');
    expect(mockLookupPitch).toHaveBeenCalledWith('食べる', 'たべる');
  });

  it('calls getLlmWordData with word, reading, and apiKey', async () => {
    await lookup('食べる', 'gsk_test');
    expect(mockGetLlmWord).toHaveBeenCalledWith('食べる', 'たべる', 'gsk_test');
  });

  it('omits exampleSentences when Tatoeba returns []', async () => {
    mockFetchExamples.mockResolvedValue([]);
    const result = await lookup('食べる', 'gsk_test');
    expect(result.exampleSentences).toBeUndefined();
  });

  it('handles missing JMdict entry — omits reading and pitch accent', async () => {
    mockLookupWord.mockResolvedValue(null);
    const result = await lookup('食べる', 'gsk_test');
    expect(result.reading).toBeUndefined();
    expect(result.pitchAccent).toBeUndefined();
    expect(mockLookupPitch).not.toHaveBeenCalled();
    // LLM is still called with empty reading when word not in JMdict
    expect(mockGetLlmWord).toHaveBeenCalledWith('食べる', '', 'gsk_test');
  });

  it('includes source: full when LLM succeeds', async () => {
    const result = await lookup('食べる', 'gsk_test');
    expect(result.source).toBe('full');
  });

  it('falls back to bundled-only when LLM throws', async () => {
    mockGetLlmWord.mockRejectedValue(new Error('API error'));
    const result = await lookup('食べる', 'gsk_test');
    expect(result.source).toBe('bundled-only');
    expect(result.zhTranslation).toBeUndefined();
    expect(result.jaDefinition).toBeUndefined();
    // Bundled data is still present
    expect(result.reading).toBe('たべる');
    expect(result.jlptLevel).toBe('N5');
  });

  it('still returns pitch accent even when LLM fails', async () => {
    mockGetLlmWord.mockRejectedValue(new Error('API error'));
    const result = await lookup('食べる', 'gsk_test');
    expect(result.pitchAccent).toBe(2);
  });
});

// ─── Bundled-only fallback ────────────────────────────────────────────────────

describe('lookup — bundled-only (no API key)', () => {
  it('returns source: bundled-only and omits LLM fields', async () => {
    const result = await lookup('食べる');

    expect(result.source).toBe('bundled-only');
    expect(result.zhTranslation).toBeUndefined();
    expect(result.jaDefinition).toBeUndefined();
    expect(result.conjugations).toBeUndefined();
  });

  it('still populates reading, jlptLevel, partOfSpeech, pitchAccent from bundled data', async () => {
    const result = await lookup('食べる');

    expect(result.reading).toBe('たべる');
    expect(result.jlptLevel).toBe('N5');
    expect(result.partOfSpeech).toBe('Ichidan verb');
    expect(result.pitchAccent).toBe(2);
  });

  it('still includes Tatoeba examples', async () => {
    const result = await lookup('食べる');
    expect(result.exampleSentences).toEqual(EXAMPLES);
  });

  it('does not call getLlmWordData when no key provided', async () => {
    await lookup('食べる');
    expect(mockGetLlmWord).not.toHaveBeenCalled();
  });
});

// ─── Sentence path ────────────────────────────────────────────────────────────

describe('lookup — sentence path', () => {
  it('classifies long text (> 8 chars) as a sentence', async () => {
    const result = await lookup('今日は学校に行きました', 'gsk_test');
    expect(result.type).toBe('sentence');
  });

  it('classifies text containing は as a sentence', async () => {
    const result = await lookup('彼女は', 'gsk_test');
    expect(result.type).toBe('sentence');
  });

  it('classifies text containing を as a sentence', async () => {
    const result = await lookup('本を', 'gsk_test');
    expect(result.type).toBe('sentence');
  });

  it('returns sentenceTranslation and keyVocabulary', async () => {
    const result = await lookup('今日は学校に行きました', 'gsk_test');
    expect(result.sentenceTranslation).toBe('今天去了学校。');
    expect(result.keyVocabulary).toEqual(LLM_SENTENCE_DATA.keyVocabulary);
    expect(result.source).toBe('full');
  });

  it('calls getLlmSentenceData (not word data)', async () => {
    await lookup('今日は学校に行きました', 'gsk_test');
    expect(mockGetLlmSentence).toHaveBeenCalledWith('今日は学校に行きました', 'gsk_test');
    expect(mockGetLlmWord).not.toHaveBeenCalled();
    expect(mockLookupWord).not.toHaveBeenCalled();
    expect(mockFetchExamples).not.toHaveBeenCalled();
  });

  it('returns bundled-only sentence result when no API key', async () => {
    const result = await lookup('今日は学校に行きました');
    expect(result.type).toBe('sentence');
    expect(result.source).toBe('bundled-only');
    expect(result.sentenceTranslation).toBeUndefined();
    expect(result.keyVocabulary).toBeUndefined();
  });

  it('falls back to bundled-only when LLM sentence call fails', async () => {
    mockGetLlmSentence.mockRejectedValue(new Error('timeout'));
    const result = await lookup('今日は学校に行きました', 'gsk_test');
    expect(result.source).toBe('bundled-only');
    expect(result.sentenceTranslation).toBeUndefined();
  });
});

// ─── Sentence detection heuristic ────────────────────────────────────────────

describe('sentence detection heuristic', () => {
  it('treats a 3-char word as a word', async () => {
    const result = await lookup('食べる', 'gsk_test');
    expect(result.type).toBe('word');
  });

  it('treats 9+ character text as a sentence (> 8 chars)', async () => {
    // 9 katakana chars — no particles, but length triggers sentence path
    const result = await lookup('アイウエオカキクケ', 'gsk_test');
    expect(result.type).toBe('sentence');
  });

  it('treats exactly 8 characters without particles as a word', async () => {
    const result = await lookup('アイウエオカキク', 'gsk_test');
    expect(result.type).toBe('word');
  });
});
