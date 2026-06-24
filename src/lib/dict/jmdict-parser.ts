/**
 * Download and parse the jmdict-simplified "jmdict-eng-common" JSON from
 * GitHub Releases.
 *
 * Source: https://github.com/scriptin/jmdict-simplified
 * Release asset: jmdict-eng-common-*.json.zip
 *
 * The JSON schema (jmdict-simplified v3.x) looks like:
 *   {
 *     "version": "...",
 *     "words": [
 *       {
 *         "id": "...",
 *         "kanji": [{ "text": "食べる", "common": true, ... }],
 *         "kana":  [{ "text": "たべる", "common": true, ... }],
 *         "sense": [{ "partOfSpeech": ["v1"], ... }]
 *       },
 *       ...
 *     ]
 *   }
 *
 * We flatten every kanji form and kana-only entry into individual JMdictEntry
 * records indexed by their surface form.
 */

import { unzipSync } from 'fflate';
import type { JMdictEntry } from '../../types/domain';

/** GitHub API endpoint to discover the versioned asset URL dynamically. */
const JMDICT_RELEASES_API =
  'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';

/**
 * Query the GitHub Releases API to find the browser_download_url for the
 * jmdict-eng-common JSON zip asset.  Asset names look like:
 *   jmdict-eng-common-3.6.1+20241028130927.json.zip
 */
async function resolveJMdictUrl(): Promise<string> {
  const res = await fetch(JMDICT_RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned HTTP ${res.status}`);
  }
  const release = await res.json() as { assets: Array<{ name: string; browser_download_url: string }> };
  const asset = release.assets.find(
    (a) => a.name.startsWith('jmdict-eng-common') && a.name.endsWith('.json.zip'),
  );
  if (!asset) {
    throw new Error('jmdict-eng-common asset not found in latest GitHub release');
  }
  console.log(`[ClipToDict] Resolved JMdict URL: ${asset.browser_download_url}`);
  return asset.browser_download_url;
}

// ─── jmdict-simplified v3 raw types ──────────────────────────────────────────

interface JMdictRawWord {
  id: string;
  kanji: Array<{ text: string; common: boolean; tags: string[] }>;
  kana: Array<{ text: string; common: boolean; tags: string[]; appliesToKanji: string[] }>;
  sense: Array<{
    partOfSpeech: string[];
    appliesToKanji: string[];
    appliesToKana: string[];
    [key: string]: unknown;
  }>;
}

interface JMdictRaw {
  version: string;
  words: JMdictRawWord[];
}

// ─── Download helpers ─────────────────────────────────────────────────────────

/** Fetch with progress callback (approximate — uses Content-Length header). */
async function fetchWithProgress(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const contentLength = response.headers.get('content-length');
  if (!contentLength || !response.body) {
    // No streaming available — just return the blob
    onProgress?.(50);
    const buf = await response.arrayBuffer();
    onProgress?.(100);
    return buf;
  }

  const total = parseInt(contentLength, 10);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(Math.round((received / total) * 100));
  }

  // Concatenate all chunks into one buffer
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/** Part-of-speech tag → human-readable string mapping (subset). */
const POS_MAP: Record<string, string> = {
  'v1': 'Ichidan verb',
  'v5u': 'Godan verb (u)',
  'v5k': 'Godan verb (ku)',
  'v5g': 'Godan verb (gu)',
  'v5s': 'Godan verb (su)',
  'v5t': 'Godan verb (tsu)',
  'v5n': 'Godan verb (nu)',
  'v5b': 'Godan verb (bu)',
  'v5m': 'Godan verb (mu)',
  'v5r': 'Godan verb (ru)',
  'vk': 'Kuru verb',
  'vs-i': 'Suru verb',
  'adj-i': 'い-adjective',
  'adj-na': 'な-adjective',
  'n': 'Noun',
  'adv': 'Adverb',
  'prt': 'Particle',
  'exp': 'Expression',
  'int': 'Interjection',
  'conj': 'Conjunction',
  'pref': 'Prefix',
  'suf': 'Suffix',
  'aux': 'Auxiliary',
  'aux-v': 'Auxiliary verb',
  'aux-adj': 'Auxiliary adjective',
  'num': 'Numeric',
  'pn': 'Pronoun',
  'vs': 'Noun or verb (suru)',
};

function resolvePOS(tags: string[]): string {
  for (const tag of tags) {
    if (tag in POS_MAP) return POS_MAP[tag];
  }
  return tags[0] ?? 'Unknown';
}

/**
 * Parse a raw JMdict-simplified word entry into one or more JMdictEntry
 * records (one per unique surface form: kanji forms + kana-only forms).
 */
function parseWord(word: JMdictRawWord): JMdictEntry[] {
  const entries: JMdictEntry[] = [];
  const firstSense = word.sense[0];
  const partOfSpeech = firstSense ? resolvePOS(firstSense.partOfSpeech) : 'Unknown';

  if (word.kanji.length > 0) {
    // For each kanji form, pair it with the applicable kana readings
    for (const k of word.kanji) {
      const applicableKana = word.kana.filter(
        (r) =>
          r.appliesToKanji.includes('*') ||
          r.appliesToKanji.includes(k.text) ||
          r.appliesToKanji.length === 0,
      );
      const primaryKana = applicableKana[0];
      if (!primaryKana) continue;

      const isCommon = k.common || primaryKana.common;
      entries.push({
        word: k.text,
        reading: primaryKana.text,
        partOfSpeech,
        common: isCommon,
      });
    }
  } else {
    // Kana-only words — the kana IS the word
    for (const r of word.kana) {
      entries.push({
        word: r.text,
        reading: r.text,
        partOfSpeech,
        common: r.common,
      });
    }
  }

  return entries;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DownloadResult {
  entries: JMdictEntry[];
}

/**
 * Download the jmdict-eng-common ZIP, decompress it, parse it, and return
 * an array of JMdictEntry records ready for IndexedDB insertion.
 *
 * @param onProgress  Optional callback receiving a 0–100 download progress pct.
 */
export async function downloadAndParseJMdict(
  onProgress?: (pct: number) => void,
): Promise<DownloadResult> {
  // Discover the versioned asset URL from the GitHub Releases API
  const url = await resolveJMdictUrl();
  const buf = await fetchWithProgress(url, onProgress);

  // Decompress ZIP (fflate handles multi-file ZIPs; we pick the first .json file)
  const zip = unzipSync(new Uint8Array(buf));
  const jsonFile = Object.keys(zip).find((f) => f.endsWith('.json'));
  if (!jsonFile) {
    throw new Error('[ClipToDict] No .json file found inside JMdict ZIP');
  }

  const jsonText = new TextDecoder().decode(zip[jsonFile]);
  const raw = JSON.parse(jsonText) as JMdictRaw;

  const entries: JMdictEntry[] = [];
  for (const word of raw.words) {
    entries.push(...parseWord(word));
  }

  console.log(`[ClipToDict] Parsed ${entries.length} JMdict entries`);
  return { entries };
}
