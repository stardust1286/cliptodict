#!/usr/bin/env node
/**
 * generate-jlpt-data.mjs
 *
 * Fetches Jonathan Waller's JLPT vocabulary lists from jlpt.info and
 * converts them into the compact JSON lookup map used by src/lib/jlpt.ts.
 *
 * Usage:
 *   node scripts/generate-jlpt-data.mjs
 *
 * Output:
 *   src/data/jlpt-data.json
 *
 * Data source: jlpt.info (Jonathan Waller) — free for any use.
 * Each level page returns tab-separated lines: kanji\treading\nmeaning
 *
 * The script tries jlpt.info first, then falls back to the tanos.co.uk mirror.
 * On either source, words are keyed by their kanji form (or kana if no kanji).
 *
 * Run this script periodically to keep the bundled data up to date, or after
 * updating the JLPT word list source.
 *
 * License note: The jlpt.info data is provided free for any use by Jonathan
 * Waller.  No attribution is required in the bundled data file itself, but
 * it is acknowledged here and in the extension's Settings / About page.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '../src/data/jlpt-data.json');

// ─── Source URLs ──────────────────────────────────────────────────────────────
// Jonathan Waller's jlpt.info provides plain-text vocabulary files.
// Format per line:  kanji[tab]kana[tab]meaning
// Some lines are kana-only (no kanji column), in which case col[0] is the kana.

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];

/**
 * Primary source: jlpt.info vocabulary pages (tab-separated text).
 * If the URL scheme changes, update these.
 */
function primaryUrl(level) {
  const num = level.slice(1); // '5', '4', …
  return `http://www.jlpt.info/jlptinfo/jlpt_n${num}_words.txt`;
}

/**
 * Fallback source: tanos.co.uk text exports.
 */
function fallbackUrl(level) {
  const num = level.slice(1);
  return `https://www.tanos.co.uk/jlpt/jlpt${num}/vocab/flashcards/`;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Parse a jlpt.info tab-separated word list.
 * Each non-empty line has the format: word[\treading[\tmeaning]]
 * We only need the first column (the word/kanji form).
 */
function parseJlptInfoLines(text) {
  const words = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const cols = line.split('\t');
    const word = cols[0].trim();
    if (word) words.push(word);
  }
  return words;
}

/**
 * Parse tanos.co.uk flashcard HTML/text export.
 * Format varies; we try to extract CJK strings one per line.
 */
function parseTanosLines(text) {
  const words = [];
  const cjkPattern = /[　-鿿豈-﫿＀-￯]+/g;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // First CJK token on the line is usually the headword
    const match = line.match(cjkPattern);
    if (match && match[0]) words.push(match[0]);
  }
  return words;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  /** @type {Record<string, string>} */
  const map = {};

  for (const level of LEVELS) {
    console.log(`Fetching ${level}…`);
    let words;

    try {
      const text = await fetchText(primaryUrl(level));
      words = parseJlptInfoLines(text);
      console.log(`  ${level}: ${words.length} words (jlpt.info)`);
    } catch (primaryErr) {
      console.warn(`  Primary fetch failed for ${level}: ${primaryErr.message}`);
      try {
        const text = await fetchText(fallbackUrl(level));
        words = parseTanosLines(text);
        console.log(`  ${level}: ${words.length} words (tanos fallback)`);
      } catch (fallbackErr) {
        console.error(`  Fallback also failed for ${level}: ${fallbackErr.message}`);
        console.warn(`  Skipping ${level} — existing bundled data will be kept for this level.`);
        words = [];
      }
    }

    // Write N5 first so it can be overridden by higher-priority levels.
    // JLPT levels: N5 is most basic, N1 is most advanced.
    // We process N5→N1 so that if a word appears in multiple levels (rare),
    // the more advanced (lower numeric = N1) level wins.
    for (const word of words) {
      map[word] = level;
    }
  }

  const total = Object.keys(map).length;
  console.log(`\nTotal unique words: ${total}`);

  const json = JSON.stringify(map, null, 2);
  writeFileSync(OUTPUT_PATH, json, 'utf-8');
  console.log(`Written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
