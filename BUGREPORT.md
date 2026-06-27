# ClipToDict — Bug Report (debugging round 2026-06-27)

Investigation started from the symptom: *"shows nothing when I underline Japanese
words as long as the word is not in the source dictionary; words may not show
every piece of information specified in PRD.md."*

Feedback loop used: `pnpm test` (Vitest, ~1s, deterministic). A `vitest.config.ts`
was added to exclude `.claude/worktrees/**` so stale agent-worktree copies stop
polluting the run with `TSConfckParseError`.

---

## Fixed in this round

### Bug A — Out-of-dictionary words render an empty popup (root cause of the report)
`lookupWordPath` returns a result with only `input` populated when the word is
absent from JMdict **and** the LLM is unavailable (no API key) or fails. The popup
then renders just the bare word. PRD F3 requires a "set up an API Key" prompt in
the fallback case, but `LookupPopup` never rendered one. In-dictionary words still
show reading/POS/pitch from bundled data, so the emptiness was only noticeable on
out-of-dictionary words — exactly the reported symptom.
**Fix:** added `StatusNote` to `LookupPopup` (word + sentence branches). When
`source === 'bundled-only'` it shows either the LLM error (Bug B) or an
"Add an API key…" prompt.

### Bug B — LLM errors were silently swallowed
`lookup.ts` used `.catch(() => null)` around both LLM calls, so a rejected key,
rate-limit, or timeout looked identical to no-API-key mode. The user-facing
`LlmError` messages (auth/rate-limit/timeout) never reached the UI.
**Fix:** `settleLlm()` captures the failure message into a new
`LookupResult.llmError` field, which the popup surfaces. Bundled data is still
returned alongside the error.

### Bug C — "common" badge shown for any LLM success
The popup rendered the "common" badge whenever `source === 'full'` (i.e. the LLM
succeeded), regardless of whether the word was in JMdict or actually flagged
common. The real `JMdictEntry.common` flag was never propagated.
**Fix:** added `LookupResult.common`, populated from `dictEntry.common`; badge now
keys off `result.common`.

### Bug D — CSV export missing PRD F7 fields
`exportCsv` only emitted reading/jlpt/POS/zhTranslation/sentenceTranslation. PRD F7
requires pitch accent, Japanese definition, conjugations, and example sentences
(pipe-separated) as well.
**Fix:** added those columns with `formatPitch/Conjugations/Examples/KeyVocab`
serializers. Covered by `src/lib/deck.test.ts`.

### Sentence-detection tests vs. implementation mismatch
The recent commit `eed71cf` ("fix: correct sentence detection") made the particle
heuristic apply only to text ≥5 chars, so `本を` / `彼女は` now classify as `word`.
Two tests still asserted the old "any particle ⇒ sentence" behavior and failed.
**Fix:** updated those tests to exercise the particle heuristic at the corrected
threshold (`彼女は元気`, `本を読んだ`) and added a test documenting that short
fragments are treated as words.

---

## Open / needs another round

1. **Popup UI has no automated test seam.** There is no jsdom/RTL setup, so the
   `LookupPopup` / `DeckView` changes (StatusNote, common badge) are verified only
   by typecheck + reasoning. **Recommend manual browser verification:** select an
   out-of-dictionary word with (a) no API key set → expect amber "Add an API key"
   note; (b) a deliberately invalid key → expect red "Translation unavailable: …"
   note. Consider adding `@testing-library/react` + `jsdom` to lock this down.

2. **`pnpm lint` is broken project-wide** — ESLint 8 finds no config file
   (`eslint .` exits 2). Pre-existing, not caused by these changes. Add a flat
   `eslint.config.js` (or `.eslintrc.cjs`) so lint actually runs in CI.

3. **`DeckView` `cliptodict:card-saved` event is never dispatched.** DeckView
   listens for it to auto-refresh, but `saveCard` / the background SAVE_CARD
   handler never fire it (and a `window` event in the background context wouldn't
   reach the popup anyway). Low impact — reopening the popup refreshes via
   `useEffect` — but the listener is dead code as wired. Worth confirming the
   intended refresh path.

4. **Possible repo hygiene:** untracked `.clone/` and `result of csv/` directories
   are present in the working tree; confirm whether they should be gitignored.

---

# Round 5 (2026-06-27) — dictionary-grounded sentence translation

## Enhancement — JMdict pre-scan for short sentences

**Motivation:** Even after Bug H (threshold fix), short compound phrases sent to the
sentence path could still have incorrect readings in `keyVocabulary` because the LLM has
no dictionary anchor and may hallucinate readings for uncommon kanji.

**Change:** `lookupSentencePath` now runs `scanDictInSentence()` before calling the LLM.
For sentences < 25 characters, it performs a greedy longest-match scan of the text against
JMdict (tries substrings of length 6 down to 1 at every position). Matched entries (word +
reading + POS) are injected into `buildSentencePrompt` as a `Dictionary entries` block with
the instruction that their readings are authoritative. For sentences ≥ 25 characters the
scan is skipped entirely — LLM accuracy on common vocabulary is already high at that length
and the IndexedDB query cost + prompt bloat outweigh the benefit.

**Files changed:**
- `src/lib/lookup.ts` — added `scanDictInSentence()`, `DICT_SCAN_THRESHOLD = 25`,
  `MAX_WORD_LEN = 6`; `lookupSentencePath` awaits the scan and passes results to LLM
- `src/lib/lookup-llm.ts` — `buildSentencePrompt` accepts `dictHints: JMdictEntry[]` and
  injects them; `getLlmSentenceData` gains an optional third parameter `dictHints = []`
- `src/lib/lookup.test.ts` — updated `calls getLlmSentenceData` assertion to expect third
  arg; added two new tests: dict hints passed for short sentences, scan skipped for long ones

---

# Round 4 (2026-06-27) — `覚書` reading wrong when selected as part of a phrase

## Bug H — Compound phrase lookup produces wrong reading (e.g. `覚書` read as `きろく`)

**Symptom:** Selecting `署名した覚書` (8 chars) as text produces an incorrect reading
`しょめいしたきろく` — where `きろく` is the reading for `記録`, not `覚書`. The same word
selected in isolation (`覚書`) correctly reads `おぼえがき`. The error is non-deterministic:
re-selecting the same phrase sometimes returns the correct reading.

**Root cause:** `isSentence()` in `src/lib/lookup.ts` used `text.length > 8` (strictly
greater than), so an 8-character string like `署名した覚書` fell into the **word path**
instead of the sentence path. In the word path, `lookupWord('署名した覚書')` returns null
(compound phrases are not in JMdict), so `dictReading` is undefined. The empty reading hint
`""` is then sent to the LLM via `getLlmWordData`. With no dictionary anchor, the LLM is
free to hallucinate the reading for the entire compound, and `きろく` (読み for `記録`) is a
plausible-sounding but wrong answer it occasionally produces. On the sentence path, the LLM
is only asked for a translation—not a reading—so this hallucination cannot occur.

**Fix:** Changed the length threshold in `isSentence()` from `> 8` to `>= 8`:

```diff
-  if (text.length > 8) return true;
+  if (text.length >= 8) return true;
```

Updated the corresponding test in `src/lib/lookup.test.ts` that previously asserted
8-char strings are words:

```diff
-  it('treats exactly 8 characters without particles as a word', async () => {
-    const result = await lookup('アイウエオカキク', 'gsk_test');
-    expect(result.type).toBe('word');
+  it('treats exactly 8 characters without particles as a sentence', async () => {
+    const result = await lookup('アイウエオカキク', 'gsk_test');
+    expect(result.type).toBe('sentence');
```

All 28 tests in `lookup.test.ts` pass after this change.

---

# Round 3 (2026-06-27) — content script console errors

## Bug F — `[wxt] Failed to load styles @ content-scripts/content.css`

**Symptom:** Every page load in developer mode prints:
```
[wxt] Failed to load styles @ chrome-extension://.../content-scripts/content.css.
Did you forget to import the stylesheet in your entrypoint? TypeError: Failed to fetch
```

**Root cause:** `cssInjectionMode: 'ui'` in `defineContentScript` tells WXT to inject
CSS into the shadow root by fetching `content-scripts/content.css` at runtime (see
`wxt/dist/client/content-scripts/ui/index.mjs` → `loadCss()`). That file is only
generated by WXT when the entrypoint imports at least one CSS file. Since `content.ts`
uses exclusively inline styles and imports no CSS, the file is never produced — but WXT
still tries to fetch it on every page, triggering the warning four times (once per
`createShadowRootUi` call).

**Fix:** Removed `cssInjectionMode: 'ui'` from `defineContentScript` in
`entrypoints/content.ts`. The shadow DOM style-isolation is achieved entirely by
`createShadowRootUi`'s shadow root boundary; WXT's CSS-injection mechanism is only
needed when you import external `.css` files that should be scoped to the shadow DOM.

```diff
 export default defineContentScript({
   matches: ['<all_urls>'],
-  cssInjectionMode: 'ui',
   async main(ctx) {
```

---

## Bug G — `Warning: createRoot(): Creating roots directly with document.body`

**Symptom:** Developer console shows (once per mounted component):
```
Warning: createRoot(): Creating roots directly with document.body is discouraged,
since its children are often manipulated by third-party scripts and browser extensions.
```

**Root cause:** WXT's `createShadowRootUi` uses `@webext-core/isolated-element`
internally, which builds the shadow DOM as a full HTML document: `<html> → <head> +
<body>`. The `container` parameter passed to `onMount` is that inner **`<body>`**
element (not the shadow host). React 18's `createRoot()` explicitly warns when passed a
`body` node because body's children are often mutated by external scripts. All three
`onMount` callbacks in `content.ts` were doing `createRoot(container)` directly.

**Fix:** In each of the three `onMount` callbacks in `entrypoints/content.ts`, create a
`<div>` mountpoint inside `container`, then mount React on the div instead:

```diff
 onMount(container) {
-  const root = createRoot(container);
+  const mountPoint = document.createElement('div');
+  container.appendChild(mountPoint);
+  const root = createRoot(mountPoint);
   root.render(React.createElement(...));
   return root;
 },
```

This pattern was applied identically to the `LookupPopup`, `SelectionButton`, and
`ClipOverlay` mount sites. `pnpm compile` passes after the change.

---

# Round 2 (same day) — timeout bug + system audit

## Bug E — Word lookup of a conjugated phrase times out (the reported bug)
Symptom: looking up `推定されています` shows *"Translation unavailable: The AI
service took too long to respond"*, yet a sentence containing it translates fine.
(Confirmed from `result of csv/cliptodict-deck (1).csv`: the `推定されています` word
card is empty; `と推定されています` and `推定` succeeded.)

Root cause: `推定されています` is 8 chars with no particle, so `isSentence` routes it
to the **word path**, which asks the LLM for reading + a Japanese definition + six
conjugation forms of an already-fully-conjugated passive-progressive phrase. On a
"thinking" model (the first in the Google registry, gemini-2.5-flash) that heavy
JSON generation exceeds the 10s deadline. The simpler sentence prompt returns in
time. Crucially, `fetchWithFallback` treated a **timeout as a hard-stop** — it
re-threw immediately instead of trying the next (faster) model.

Fix: in `llm.ts`, a timeout now **falls through to the next model** (a timeout is
model-specific — the lighter fallback models answer fine), while auth (401) and
rate-limit (429) remain hard-stops (account-level). If every model times out, the
final error is still `LlmTimeoutError`. Covered by new `llm.test.ts` cases.

## Optimization — Tatoeba no longer blocks the LLM call
In `lookupWordPath`, the Tatoeba example fetch (up to 5s) was awaited in phase 1,
before the much slower LLM call in phase 2 even started. It's now kicked off and
**overlapped** with phase 2, shaving up to ~5s off word-lookup latency when
Tatoeba is slow. Example sentences are still awaited and included.

## Audit — still open / needs another round

5. **Screen-clip OCR captures the overlay UI.** `ClipOverlay` keeps its dark tint
   (`rgba(0,0,0,0.15)`) and the centered "Capturing…" box on screen while the
   background runs `captureVisibleTab`. The OCR image is taken *through* the
   overlay, so the tint (and possibly the dashed selection border / "Capturing…"
   box, depending on React paint timing) is baked into what the vision model
   sees. Proper fix: have the content script hide the overlay, wait a frame, then
   signal the background to capture. Needs manual browser verification.

6. **`isSentence` is a crude heuristic.** A non-dictionary verb phrase like
   `推定されています` (8 chars, no particle) is treated as a "word" and asked for
   conjugations, which is semantically off (the timeout fallthrough now makes it
   *work*, but a translation-style result would be better). Consider routing
   out-of-JMdict inputs containing conjugation markers (される / ています / etc.)
   to the sentence path.

7. **Dictionary install can run twice concurrently on first install.**
   `background.ts` calls `installDictionary()` from both `onInstalled` and the
   service-worker-startup check; on a fresh install both see empty stores and both
   download. Data integrity is fine (keyed `put` overwrites) but bandwidth/CPU is
   wasted. Consider a single in-flight guard.
