import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchExamples } from './tatoeba';

afterEach(() => { vi.restoreAllMocks(); });

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }));
}

const SAMPLE_RESPONSE = {
  data: [
    {
      id: 1,
      text: '私は毎日ご飯を食べる。',
      lang: 'jpn',
      translations: [[{ id: 2, text: '我每天吃饭。', lang: 'cmn' }]],
    },
    {
      id: 3,
      text: '食べるのが楽しい。',
      lang: 'jpn',
      translations: [[{ id: 4, text: '吃东西很开心。', lang: 'cmn' }]],
    },
  ],
};

describe('fetchExamples', () => {
  it('returns correct { jp, zh } pairs from a valid API response', async () => {
    mockFetch(200, SAMPLE_RESPONSE);
    const results = await fetchExamples('食べる');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ jp: '私は毎日ご飯を食べる。', zh: '我每天吃饭。' });
    expect(results[1]).toEqual({ jp: '食べるのが楽しい。', zh: '吃东西很开心。' });
  });

  it('returns [] when API returns an empty data array', async () => {
    mockFetch(200, { data: [] });
    const results = await fetchExamples('食べる');
    expect(results).toEqual([]);
  });

  it('returns [] on non-200 status', async () => {
    mockFetch(500, { error: 'server error' });
    const results = await fetchExamples('食べる');
    expect(results).toEqual([]);
  });

  it('returns [] on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
    const results = await fetchExamples('食べる');
    expect(results).toEqual([]);
  });

  it('returns [] on timeout (AbortError)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    ));
    const results = await fetchExamples('食べる');
    expect(results).toEqual([]);
  });

  it('skips sentences that have no Chinese translation', async () => {
    mockFetch(200, {
      data: [
        {
          id: 1,
          text: '食べる。',
          lang: 'jpn',
          translations: [[{ id: 2, text: 'to eat', lang: 'eng' }]],
        },
        {
          id: 3,
          text: '食べた。',
          lang: 'jpn',
          translations: [[{ id: 4, text: '吃了。', lang: 'cmn' }]],
        },
      ],
    });
    const results = await fetchExamples('食べる');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ jp: '食べた。', zh: '吃了。' });
  });

  it('encodes the word in the request URL', async () => {
    mockFetch(200, { data: [] });
    await fetchExamples('食べる');
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('食べる'));
  });

  it('picks the Chinese translation when translations array is nested', async () => {
    mockFetch(200, {
      data: [
        {
          id: 1,
          text: '走る。',
          lang: 'jpn',
          translations: [
            [
              { id: 2, text: 'to run', lang: 'eng' },
              { id: 3, text: '跑步。', lang: 'cmn' },
            ],
          ],
        },
      ],
    });
    const results = await fetchExamples('走る');
    expect(results).toHaveLength(1);
    expect(results[0].zh).toBe('跑步。');
  });
});
