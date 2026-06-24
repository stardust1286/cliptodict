/**
 * Download and parse Kanjium pitch accent data from the raw GitHub URL.
 *
 * Source: https://github.com/mifunetoshiro/kanjium
 * File:   data/source_files/raw/accents.txt
 *
 * Format (tab-separated, one entry per line):
 *   word \t reading \t pitch_pattern
 *
 * pitch_pattern is a comma-separated list of accented forms with annotations
 * like "0" (heiban), "2", "3", etc.  We extract the numeric drop position.
 *
 * Example line:
 *   食べる\tたべる\t2
 */

import type { PitchAccentEntry } from '../../types/domain';

const KANJIUM_URL =
  'https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt';

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a single numeric pitch position from the raw pitch pattern string.
 *
 * The raw field can look like "2", "0", "2,4", or have annotations such as
 * "2(3)" or "0[N]".  We grab the first integer we can find.
 */
function parsePitchPosition(raw: string): number | null {
  const match = raw.match(/\d+/);
  if (!match) return null;
  return parseInt(match[0], 10);
}

export async function downloadAndParsePitchAccent(
  onProgress?: (pct: number) => void,
): Promise<PitchAccentEntry[]> {
  const response = await fetch(KANJIUM_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Kanjium data`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  let text: string;
  if (total > 0 && response.body) {
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

    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(combined);
  } else {
    onProgress?.(50);
    text = await response.text();
    onProgress?.(100);
  }

  const entries: PitchAccentEntry[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;

    const [word, reading, pitchRaw] = parts;
    const position = parsePitchPosition(pitchRaw);
    if (position === null) continue;

    const key = `${word}+${reading}`;
    entries.push({ key, word, reading, position });
  }

  console.log(`[ClipToDict] Parsed ${entries.length} pitch accent entries`);
  return entries;
}
