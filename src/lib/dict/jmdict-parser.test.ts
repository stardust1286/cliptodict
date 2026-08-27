import { describe, it, expect, vi, afterEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { downloadAndParseJMdict } from './jmdict-parser';

const RELEASES_RESPONSE = {
  assets: [
    {
      name: 'jmdict-eng-common-3.6.1+20241028130927.json.zip',
      browser_download_url: 'https://example.com/jmdict.zip',
    },
  ],
};

function zipOf(jmdictJson: unknown): Uint8Array {
  return zipSync({ 'jmdict-eng-common.json': strToU8(JSON.stringify(jmdictJson)) });
}

function mockFetchSequence(bodies: Array<{ json?: unknown; arrayBuffer?: Uint8Array }>) {
  const mock = vi.fn();
  for (const b of bodies) {
    mock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve(b.json),
      arrayBuffer: () => Promise.resolve(b.arrayBuffer?.buffer ?? new ArrayBuffer(0)),
      body: null,
    });
  }
  vi.stubGlobal('fetch', mock);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadAndParseJMdict — GitHub API rate limiting', () => {
  it('throws a clear rate-limit message on a 403 from the Releases API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      }),
    );

    await expect(downloadAndParseJMdict()).rejects.toThrow(/rate-limiting/i);
  });

  it('throws a clear rate-limit message on a 429 from the Releases API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      }),
    );

    await expect(downloadAndParseJMdict()).rejects.toThrow(/rate-limiting/i);
  });
});

describe('downloadAndParseJMdict — malformed entry handling', () => {
  it('parses well-formed entries normally', async () => {
    const raw = {
      version: '3.6.1',
      words: [
        {
          id: '1',
          kanji: [{ text: '食べる', common: true, tags: [] }],
          kana: [{ text: 'たべる', common: true, tags: [], appliesToKanji: ['*'] }],
          sense: [{ partOfSpeech: ['v1'], appliesToKanji: [], appliesToKana: [] }],
        },
      ],
    };
    mockFetchSequence([{ json: RELEASES_RESPONSE }, { arrayBuffer: zipOf(raw) }]);

    const { entries } = await downloadAndParseJMdict();

    expect(entries).toEqual([
      { word: '食べる', reading: 'たべる', partOfSpeech: 'Ichidan verb', common: true },
    ]);
  });

  it('skips a malformed word entry instead of aborting the whole install', async () => {
    const raw = {
      version: '3.6.1',
      words: [
        // Malformed: kanji/kana fields missing entirely (simulates an upstream schema change).
        { id: 'bad-1', sense: [] },
        {
          id: '2',
          kanji: [{ text: '飲む', common: true, tags: [] }],
          kana: [{ text: 'のむ', common: true, tags: [], appliesToKanji: ['*'] }],
          sense: [{ partOfSpeech: ['v5m'], appliesToKanji: [], appliesToKana: [] }],
        },
      ],
    };
    mockFetchSequence([{ json: RELEASES_RESPONSE }, { arrayBuffer: zipOf(raw) }]);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { entries } = await downloadAndParseJMdict();

    // The malformed entry is skipped; the well-formed one right after it still parses.
    expect(entries).toEqual([
      { word: '飲む', reading: 'のむ', partOfSpeech: 'Godan verb (mu)', common: true },
    ]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping malformed JMdict entry'),
      expect.anything(),
    );

    consoleWarnSpy.mockRestore();
  });
});
