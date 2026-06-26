import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectProvider,
  callLLM,
  callVisionLLM,
  LlmAuthError,
  LlmRateLimitError,
  LlmTimeoutError,
  LlmUnknownKeyError,
} from './llm';

// ─── detectProvider ───────────────────────────────────────────────────────────

describe('detectProvider', () => {
  it('detects Groq from gsk_ prefix', () => {
    expect(detectProvider('gsk_abc123')).toBe('groq');
  });

  it('detects Google from AIzaSy prefix (legacy format)', () => {
    expect(detectProvider('AIzaSyXYZ')).toBe('google');
  });

  it('detects Google from AQ. prefix (new AI Studio format)', () => {
    expect(detectProvider('AQ.Ab8RN6abc')).toBe('google');
  });

  it('detects OpenRouter from sk-or- prefix', () => {
    expect(detectProvider('sk-or-abc')).toBe('openrouter');
  });

  it('returns null for unrecognized prefix', () => {
    expect(detectProvider('sk-openai-abc')).toBeNull();
    expect(detectProvider('')).toBeNull();
    expect(detectProvider('random')).toBeNull();
  });
});

// ─── callLLM / callVisionLLM — fetch mock helpers ─────────────────────────────

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }));
}

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const mock = vi.fn();
  for (const r of responses) {
    mock.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
    });
  }
  vi.stubGlobal('fetch', mock);
}

const OK_RESPONSE = {
  choices: [{ message: { content: 'result text' } }],
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// ─── callLLM — unknown key ────────────────────────────────────────────────────

describe('callLLM — unknown key', () => {
  it('throws LlmUnknownKeyError for unrecognized key format', async () => {
    await expect(callLLM('bad-key', 'hello')).rejects.toBeInstanceOf(LlmUnknownKeyError);
  });
});

// ─── callLLM — capability filtering ──────────────────────────────────────────

describe('callLLM — routes to text-capable models only', () => {
  it('calls the API with a text-capable model for a Groq key', async () => {
    mockFetch(200, OK_RESPONSE);
    await callLLM('gsk_test', 'hello');
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    // The selected model must be in the Groq text-capable list
    expect(typeof body.model).toBe('string');
    expect(body.model.length).toBeGreaterThan(0);
  });

  it('calls the API with a text-capable model for a Google key', async () => {
    mockFetch(200, OK_RESPONSE);
    await callLLM('AIzaSyTest', 'hello');
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toMatch(/^gemini-/);
  });
});

// ─── callVisionLLM — capability filtering ────────────────────────────────────

describe('callVisionLLM — routes to vision-capable models only', () => {
  it('sends image content in the request body', async () => {
    mockFetch(200, OK_RESPONSE);
    await callVisionLLM('AIzaSyTest', 'read this image', 'data:image/png;base64,abc');
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    const content = body.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content.some((p: { type: string }) => p.type === 'image_url')).toBe(true);
  });

  it('uses a vision-capable model (not a text-only model)', async () => {
    mockFetch(200, OK_RESPONSE);
    await callVisionLLM('gsk_test', 'read this', 'data:image/png;base64,abc');
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    // Must not be a text-only Groq model
    expect(body.model).not.toBe('llama-3.3-70b-versatile');
    expect(body.model).not.toBe('llama-3.1-8b-instant');
  });
});

// ─── Model fallback ───────────────────────────────────────────────────────────

describe('model fallback', () => {
  it('retries with the next model when the first returns 400', async () => {
    mockFetchSequence([
      { status: 400, body: { error: 'model not found' } },
      { status: 200, body: OK_RESPONSE },
    ]);
    const result = await callLLM('AIzaSyTest', 'hello');
    expect(result).toBe('result text');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('retries with the next model when the first returns 404', async () => {
    mockFetchSequence([
      { status: 404, body: { error: 'not found' } },
      { status: 200, body: OK_RESPONSE },
    ]);
    const result = await callLLM('gsk_test', 'hello');
    expect(result).toBe('result text');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('throws a user-readable error when all models are exhausted', async () => {
    // Every call fails with 400
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'gone' }),
      text: () => Promise.resolve('gone'),
    }));
    await expect(callLLM('AIzaSyTest', 'hello')).rejects.toThrow(/update/i);
  });
});

// ─── Hard stops — no retry ────────────────────────────────────────────────────

describe('hard stops — no model retry', () => {
  it('throws LlmAuthError immediately on 401, without retrying', async () => {
    mockFetch(401, { error: 'unauthorized' });
    await expect(callLLM('gsk_test', 'hello')).rejects.toBeInstanceOf(LlmAuthError);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('throws LlmRateLimitError immediately on 429, without retrying', async () => {
    mockFetch(429, { error: 'rate limited' });
    await expect(callLLM('gsk_test', 'hello')).rejects.toBeInstanceOf(LlmRateLimitError);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('throws LlmTimeoutError when the request times out, without retrying', async () => {
    // Reject via the real AbortSignal so controller.signal.aborted === true
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) =>
      new Promise((_, reject) => {
        opts.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      })
    ));
    const promise = callLLM('gsk_test', 'hello');
    // Run timers and attach rejection handler simultaneously so there's no
    // window where the promise is rejected but unhandled.
    await Promise.all([
      vi.runAllTimersAsync(),
      expect(promise).rejects.toBeInstanceOf(LlmTimeoutError),
    ]);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
