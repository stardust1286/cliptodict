# ClipToDict — Implementation Issues

Each issue is independently implementable. Start a fresh session per issue, pass it the PRD.md and this single issue. Run `/implement`.

---

## Issue #1: Project Scaffold & Extension Boilerplate

**Goal:** Bootstrapped WXT + React + TypeScript project that loads in Chrome developer mode.

**Tasks:**
- Init WXT project: `npx wxt@latest init cliptodict --template react-ts`
- Configure `wxt.config.ts`: MV3, permissions (`storage`, `activeTab`, `scripting`, `offscreen`, `declarativeNetRequest` or `tabs` for screen clip)
- Set up TailwindCSS
- Verify extension loads in Chrome with a working popup showing "ClipToDict"
- Set up path aliases and base tsconfig
- Add `CONTEXT.md` domain types as shared TypeScript types in `src/types/domain.ts` (LookupResult, VocabularyCard)

**Done when:** `pnpm dev` → extension loads in Chrome, popup renders without errors.

---

## Issue #2: Dictionary Data Pipeline (IndexedDB Install)

**Goal:** On extension install, download and index JMdict common + Kanjium pitch accent into IndexedDB, ready for fast lookup by word+reading string.

**Tasks:**
- Background service worker: listen for `chrome.runtime.onInstalled`
- Download `jmdict-eng-common` JSON from `scriptin/jmdict-simplified` GitHub Releases
- Download `kanjium/accents.txt` from raw GitHub URL
- Parse and index both datasets into two IndexedDB object stores:
  - `jmdict` — keyed by `word` text, indexed by `reading`
  - `pitchAccent` — keyed by `word+reading` composite
- Show install progress in popup if opened during install
- Unit: given a known word (e.g. 食べる), `lookupWord('食べる')` returns `{ reading: 'たべる', partOfSpeech: 'v1', common: true }`
- Unit: `lookupPitchAccent('食べる', 'たべる')` returns `{ position: 2 }`

**Done when:** After fresh install, can query both stores by word string and get correct results.

---

## Issue #3: JLPT Level Bundled Data

**Goal:** Bundle a JLPT N1–N5 word list and expose a fast lookup function.

**Tasks:**
- Source Jonathan Waller's JLPT word lists (N1–N5) — verify license (free for any use)
- Convert to a compact JSON lookup map: `{ [word: string]: 'N1' | 'N2' | 'N3' | 'N4' | 'N5' }`
- Bundle as a static asset in the extension (small enough to bundle — each level is ~2–5 KB)
- Expose `lookupJlpt(word: string): 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | null`
- Unit: `lookupJlpt('食べる')` returns `'N5'`

**Done when:** Fast synchronous JLPT lookup works for all 5 levels with no network call.

---

## Issue #4: LLM Integration (Translation + Definition)

**Goal:** Given a word or sentence and a user API key, return LLM-powered fields. Provider is auto-detected from the key — no configuration needed from the user.

**Supported providers (auto-detected by key prefix):**
| Prefix | Provider | Notes |
|---|---|---|
| `gsk_` | Groq | Free tier |
| `AIzaSy` / `AQ.` | Google AI Studio | Free tier; both key formats supported |
| `sk-or-` | OpenRouter | Marketplace |

**Implemented files:**
- `src/lib/llm.ts`
  - `callLLM(apiKey, prompt)` — text completion
  - `callVisionLLM(apiKey, prompt, imageDataUrl)` — vision/OCR completion
  - `detectProvider(apiKey)` — returns `'groq' | 'google' | 'openrouter' | null`
  - Error classes: `LlmAuthError`, `LlmRateLimitError`, `LlmTimeoutError`, `LlmUnknownKeyError` (all with user-readable messages, no HTTP codes exposed)
  - Capability-based model registry: each provider has an ordered `models: { id, can: Capability[] }[]` list; call-time selection filters by `'text'` or `'vision'` capability; deprecated models are silently skipped via fallback loop
- `src/lib/lookup-llm.ts`
  - `getLlmWordData(word, reading, apiKey)` → `{ zhTranslation, jaDefinition, conjugations }`
  - `getLlmSentenceData(sentence, apiKey)` → `{ sentenceTranslation, keyVocabulary }`
  - `getOcrText(imageDataUrl, apiKey)` → extracted text string
- `src/lib/llm.test.ts` — 16 Vitest tests covering: provider detection, text/vision routing, model fallback on 400/404, hard stops on 401/429/timeout, exhausted model list

**Done when:** ✅ All three LLM functions return correct structured data with real Groq and Google AI Studio keys; error cases surfaced with user-readable messages; model fallback and capability routing verified by automated tests.

---

## Issue #5: Tatoeba Example Sentences

**Goal:** Given a Japanese word, fetch up to 3 Japanese–Chinese sentence pairs from the Tatoeba API.

**Tasks:**
- `src/lib/tatoeba.ts` — `fetchExamples(word: string): Promise<Array<{ jp: string; zh: string }>>`
- Call `https://api.tatoeba.org/v1/sentences?lang=jpn&q={word}&trans:lang=cmn&showtrans=matching&limit=3`
- Parse response: extract `text` (JP) and `translations[][].text` (ZH)
- Handle empty results, network errors, and timeout gracefully (return `[]` on any failure — non-critical)
- Unit: mock API response → correct `{ jp, zh }` array shape
- Integration test (manual): `fetchExamples('食べる')` returns 1–3 real sentence pairs

**Done when:** Function returns correct pairs for known words; degrades gracefully to `[]` on errors.

---

## Issue #6: Full Lookup Pipeline

**Goal:** Assemble all data sources into a single `lookup(text, apiKey?)` function that returns a complete LookupResult.

**Tasks:**
- `src/lib/lookup.ts` — `lookup(text: string, apiKey?: string): Promise<LookupResult>`
- Detect word vs. sentence (heuristic: > 8 characters or contains particles → sentence)
- Word path: parallel calls to IndexedDB (JMdict + pitch + JLPT) + Tatoeba + LLM
- Sentence path: LLM only (translation + key vocabulary)
- Bundled-only fallback when no API key
- Respect LookupResult TypeScript schema from PRD
- Unit tests: word lookup with mocked data sources returns correct LookupResult shape
- Unit tests: sentence lookup returns correct shape
- Unit tests: bundled-only fallback populates `source: 'bundled-only'` and omits LLM fields

**Done when:** `lookup('食べる', key)` and `lookup('今日は学校に行きました', key)` return correctly shaped results; fallback works without key.

---

## Issue #7: Text Selection UI (Content Script)

**Goal:** When user selects Japanese text on a page, a floating trigger button appears. Clicking it triggers lookup.

**Tasks:**
- Content script: listen for `mouseup`, debounce, check if selection is non-empty
- Render a small floating button (WXT content script + React portal or vanilla DOM)
- Button position: near selection end, within viewport
- Clicking button: send message to background → run lookup → receive LookupResult → render Lookup Popup
- Dismiss on Escape, on click outside, on new selection
- Style: minimal, unobtrusive, doesn't interfere with page content
- Test on: Wikipedia (ja), NHK Web Easy, Twitter/X

**Done when:** On any Japanese webpage, selecting text shows the button, clicking it shows the popup with real data.

---

## Issue #8: Screen Clip UI (Content Script)

**Goal:** Keyboard shortcut activates a screen clip mode; drawn region is captured and OCR'd via LLM.

**Tasks:**
- Register keyboard shortcut in `wxt.config.ts` (e.g. `Alt+Shift+S`)
- Content script: on shortcut, overlay the full viewport with a semi-transparent capture layer
- User draws bounding box (mousedown → mousemove → mouseup)
- Capture the region: use `html2canvas` or Chrome's `chrome.tabs.captureVisibleTab` (needs `"<all_urls>"` or offscreen doc) — prefer `captureVisibleTab` for accuracy
- Crop the captured screenshot to the drawn bounding box
- Send cropped image (as data URL) to background → LLM OCR → lookup pipeline → Lookup Popup
- Escape to cancel capture mode
- Test on: YouTube subtitle region

**Done when:** Drawing a box over a YouTube subtitle returns a lookup of the subtitle text.

---

## Issue #9: Lookup Popup Component

**Goal:** A polished floating popup that displays a LookupResult and allows saving to Deck.

**Tasks:**
- React component `<LookupPopup result={LookupResult} onSave={fn} onDismiss={fn} />`
- Smart positioning: appear near trigger point, reposition if overflow (flip side, clamp to viewport)
- Word popup sections:
  - Header: word + reading (ruby/furigana) + JLPT badge + common badge
  - Chinese translation (large, prominent)
  - Part of speech
  - Pitch accent visual (H/L dots or line above morae)
  - Japanese definition
  - Conjugations (collapsible table)
  - Example sentences (up to 3, JP + ZH)
- Sentence popup sections:
  - Full Chinese translation
  - Key vocabulary list (word + meaning)
- Loading state while fetching
- Error state (no API key → prompt to set up key)
- "Save" button → shows confirmation → card saved
- Dismiss on Escape or backdrop click
- Responsive to light/dark page backgrounds

**Done when:** Popup renders all LookupResult fields correctly in a usable layout; save button works.

---

## Issue #10: Deck View & Card Storage

**Goal:** Extension popup shows a browsable list of saved Vocabulary Cards.

**Tasks:**
- `src/lib/deck.ts`:
  - `saveCard(result: LookupResult): Promise<VocabularyCard>`
  - `getCards(): Promise<VocabularyCard[]>` (most recent first)
  - `deleteCard(id: string): Promise<void>`
  - `clearAllCards(): Promise<void>`
  - `exportCsv(): string` — returns CSV string of all cards
- Extension popup (`src/popup/`):
  - Deck View: scrollable list of VocabularyCard components
  - `<VocabularyCard card={card} />` — shows collapsed/expanded on click
  - Collapsed: word + reading + ZH translation + JLPT badge
  - Expanded: all fields
  - Delete button on expanded card
  - "Export CSV" button → triggers browser download
- IndexedDB store `cliptodict-deck` with auto-increment id

**Done when:** Cards saved from popup appear in deck view; export downloads valid CSV; delete works.

---

## Issue #11: Settings Page

**Goal:** User can enter and save their API key; attribution is displayed.

**Tasks:**
- Settings accessible from extension popup (gear icon or "Settings" link)
- API Key section:
  - Text input (password type) for Groq or OpenRouter key
  - Instructions: "Get a free key at groq.com" with link
  - Save button → stores in `chrome.storage.local`
  - Validation: test key with a minimal API call; show ✓ or ✗
- Attribution section:
  - JMdict/EDRDG (CC BY-SA 4.0) — required by license
  - Kanjium/Uros O. (CC BY-SA 4.0) — required by license
  - Tatoeba (CC BY 2.0 FR)
- Danger zone:
  - "Clear all cards" button with confirmation dialog

**Done when:** User can enter a key, it persists across browser restarts, attribution is visible.

---

## Issue #12: End-to-End QA & Polish

**Goal:** Working end-to-end on real sites; edge cases handled.

**Tasks:**
- Test full flow on: NHK Web Easy, Wikipedia JP, YouTube (subtitle clip)
- Test with no API key (bundled-only mode)
- Test with invalid API key (graceful error)
- Test very long words, kana-only words, words not in JMdict
- Test sentence lookup with complex grammar
- Popup positioning edge cases: near page edges, in iframes
- Fix any crashes or broken layouts found
- Add error boundary to popup
- Verify attribution screen is present
- Verify CSV export is valid UTF-8 and opens correctly in Excel/Sheets
- Performance: lookup should feel fast (< 2s perceived with loading state)

**Done when:** All major flows work on real sites without crashes.
