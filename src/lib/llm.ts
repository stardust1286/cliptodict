/**
 * Core LLM client — Issue #4.
 *
 * Provider is detected automatically from the API key prefix:
 *   gsk_    → Groq              (free tier)
 *   AIzaSy  → Google AI Studio  (free tier)
 *   sk-or-  → OpenRouter        (marketplace)
 *
 * Each provider has a single ordered model registry. Every entry declares
 * which capabilities it supports ('text' | 'vision' | ...). Call-time
 * selection filters by the required capability and tries models in order,
 * silently skipping deprecated ones (4xx model errors). New capabilities
 * (e.g. 'audio') are just a new string in the Capability union — no new
 * arrays, no new config fields.
 *
 * Hard-stop errors (auth, rate-limit, timeout) are re-thrown immediately
 * without retrying other models.
 */

const TIMEOUT_MS = 10_000;

// ─── Capability registry ──────────────────────────────────────────────────────

export type Capability = 'text' | 'vision'; // extend freely: | 'audio' | 'code'

interface ModelSpec {
  id: string;
  can: Capability[];
}

type Provider = 'groq' | 'google' | 'openrouter';

interface ProviderConfig {
  base: string;
  /** Ordered by preference — best / newest first, stable fallbacks last. */
  models: ModelSpec[];
  extraHeaders?: Record<string, string>;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  groq: {
    base: 'https://api.groq.com/openai/v1',
    models: [
      // Llama 4 — text + vision (Scout is faster, Maverick is more capable)
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct',    can: ['text', 'vision'] },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', can: ['text', 'vision'] },
      // Llama 3.3 — text only (best quality for text tasks on Groq)
      { id: 'llama-3.3-70b-versatile',                      can: ['text'] },
      // Llama 3.2 Vision — stable vision fallbacks
      { id: 'llama-3.2-90b-vision-preview',                 can: ['text', 'vision'] },
      { id: 'llama-3.2-11b-vision-preview',                 can: ['text', 'vision'] },
      // Llama 3.1 — fast text fallback
      { id: 'llama-3.1-8b-instant',                         can: ['text'] },
    ],
  },
  google: {
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      // Gemini 2.5 Flash — best balance of speed and quality
      { id: 'gemini-2.5-flash',      can: ['text', 'vision'] },
      { id: 'gemini-2.5-flash-lite', can: ['text', 'vision'] },
      // Gemini 2.0 Flash — stable fallback
      { id: 'gemini-2.0-flash',      can: ['text', 'vision'] },
      // Gemini 1.5 Flash — widest availability fallback
      { id: 'gemini-1.5-flash',      can: ['text', 'vision'] },
    ],
  },
  openrouter: {
    base: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'google/gemini-flash-1.5',             can: ['text', 'vision'] },
      { id: 'qwen/qwen3-32b',                      can: ['text'] },
      { id: 'meta-llama/llama-3.3-70b-instruct',   can: ['text'] },
    ],
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/cliptodict',
      'X-Title': 'ClipToDict',
    },
  },
};

function modelsFor(config: ProviderConfig, capability: Capability): string[] {
  return config.models
    .filter(m => m.can.includes(capability))
    .map(m => m.id);
}

export function detectProvider(apiKey: string): Provider | null {
  if (apiKey.startsWith('gsk_')) return 'groq';
  if (apiKey.startsWith('AIzaSy') || apiKey.startsWith('AQ.')) return 'google';
  if (apiKey.startsWith('sk-or-')) return 'openrouter';
  return null;
}

// ─── Error types (messages written for end users) ─────────────────────────────

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export class LlmAuthError extends LlmError {
  constructor() {
    super(
      'Your API key was rejected. ' +
      'Please check that you copied it correctly and that it is still active.',
    );
    this.name = 'LlmAuthError';
  }
}

export class LlmRateLimitError extends LlmError {
  constructor() {
    super("You've hit the rate limit. Please wait a moment and try again.");
    this.name = 'LlmRateLimitError';
  }
}

export class LlmTimeoutError extends LlmError {
  constructor() {
    super('The AI service took too long to respond. Please try again.');
    this.name = 'LlmTimeoutError';
  }
}

export class LlmUnknownKeyError extends LlmError {
  constructor() {
    super(
      'API key not recognized. ClipToDict works with:\n' +
      '• Groq — free key at groq.com (starts with gsk_)\n' +
      '• Google AI Studio — free key at aistudio.google.com (starts with AIzaSy or AQ.)\n' +
      '• OpenRouter — key at openrouter.ai (starts with sk-or-)',
    );
    this.name = 'LlmUnknownKeyError';
  }
}

// ─── Internal types ───────────────────────────────────────────────────────────

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image_url'; image_url: { url: string } };
type ContentPart = TextPart | ImagePart;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

// ─── Core fetch (single model) ────────────────────────────────────────────────

async function fetchCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({ model, messages, temperature: 0 }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timerId);
    if (controller.signal.aborted) throw new LlmTimeoutError();
    throw new LlmError('Could not reach the AI service. Check your internet connection.');
  }
  clearTimeout(timerId);

  if (response.status === 401) throw new LlmAuthError();
  if (response.status === 429) throw new LlmRateLimitError();
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new LlmError(`AI service error (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new LlmError('Unexpected response from AI service.');
  return content;
}

// ─── Model fallback loop ──────────────────────────────────────────────────────

async function fetchWithFallback(
  baseUrl: string,
  apiKey: string,
  models: string[],
  messages: ChatMessage[],
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  let timedOut = false;

  for (const model of models) {
    try {
      return await fetchCompletion(baseUrl, apiKey, model, messages, extraHeaders);
    } catch (err) {
      // Auth (401) and rate-limit (429) are account-level: every model would
      // fail identically, so stop immediately.
      if (err instanceof LlmAuthError || err instanceof LlmRateLimitError) {
        throw err;
      }
      // A timeout is model-specific, NOT account-level. A heavy prompt can make
      // a slow "thinking" model (e.g. the first, highest-quality one) exceed the
      // deadline while a lighter fallback model answers fine. So remember it and
      // fall through to the next model instead of hard-stopping.
      if (err instanceof LlmTimeoutError) {
        timedOut = true;
        continue;
      }
      // Model-level error (400/404/422) — try the next model.
    }
  }

  // Exhausted every model. Surface the most informative reason.
  if (timedOut) throw new LlmTimeoutError();
  throw new LlmError(
    'All AI models are currently unavailable. ' +
    'Please try again later, or update the extension to get the latest model list.',
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a text prompt to the LLM.
 * Provider and model list are resolved automatically from the API key.
 */
export async function callLLM(apiKey: string, prompt: string): Promise<string> {
  const provider = detectProvider(apiKey);
  if (!provider) throw new LlmUnknownKeyError();

  const config = PROVIDERS[provider];
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  return fetchWithFallback(config.base, apiKey, modelsFor(config, 'text'), messages, config.extraHeaders ?? {});
}

/**
 * Send a vision prompt (text + image) to the LLM. Used for screen-clip OCR.
 * Only models that declare 'vision' capability are considered.
 */
export async function callVisionLLM(
  apiKey: string,
  prompt: string,
  imageDataUrl: string,
): Promise<string> {
  const provider = detectProvider(apiKey);
  if (!provider) throw new LlmUnknownKeyError();

  const config = PROVIDERS[provider];
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
  return fetchWithFallback(config.base, apiKey, modelsFor(config, 'vision'), messages, config.extraHeaders ?? {});
}
