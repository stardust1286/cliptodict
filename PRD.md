# ClipToDict — Product Requirements Document

## Overview

ClipToDict is a Chrome extension that lets Japanese learners instantly look up the meaning of any word or sentence they encounter while browsing. The user captures text via selection or screen clip, a floating popup appears with a full dictionary entry (reading, Chinese translation, definition, pitch accent, JLPT level, conjugations, example sentences), and optionally saves it as a Vocabulary Card to a browsable deck.

**Target user:** Chinese-native Japanese learner at approximately N4–N1 level, reading Japanese websites and watching Japanese YouTube.

---

## Tech Stack

- **Extension framework:** WXT (`wxt.dev`) — MV3, handles service worker, content scripts, popup
- **UI framework:** React + TypeScript
- **Build tool:** Vite (via WXT)
- **Styling:** TailwindCSS (recommended) or CSS modules

---

## Data Architecture

### Bundled Static Data (installed with extension)
Loaded into IndexedDB on first install via a background install routine.

| Dataset | Source | Size (compressed) | Provides |
|---|---|---|---|
| JMdict English common | `jmdict-simplified` `jmdict-eng-common` | ~1.4 MB | reading, part-of-speech, common flag |
| Kanjium pitch accent | `mifunetoshiro/kanjium` `accents.txt` | ~3.1 MB | pitch accent (mora drop position) |

**License requirement:** CONTEXT.md includes a required attribution screen for CC BY-SA 4.0 sources (JMdict/EDRDG and Kanjium/Uros O.).

### Runtime API Sources
Called per Lookup.

| Source | Provides | Notes |
|---|---|---|
| Tatoeba REST API (`api.tatoeba.org`) | Example sentences (JP + ZH) | Free, no key, 32,974 JP↔ZH pairs |
| LLM (Groq / Google AI Studio / OpenRouter) | Chinese translation, Japanese monolingual definition, conjugations, OCR | User-supplied API key — provider auto-detected from key prefix |

### Extension Storage
- **`chrome.storage.local`:** User settings (API Key, preferences)
- **IndexedDB `cliptodict-dict`:** Bundled dictionary data (JMdict + pitch accent)
- **IndexedDB `cliptodict-deck`:** Saved Vocabulary Cards (the user's Deck)

---

## Features

### F1 — Text Selection Lookup
1. User highlights Japanese text on any webpage
2. A floating trigger button appears near the selection
3. User clicks the button
4. Extension sends the selected text through the Lookup pipeline
5. Lookup Popup appears near the selection with the Lookup Result

### F2 — Screen Clip Lookup
1. User presses the keyboard shortcut (e.g. `Alt+Shift+S`)
2. A crosshair overlay appears on the page
3. User draws a bounding box over screen content (e.g. YouTube subtitle)
4. The captured region image is sent to the vision-capable LLM for OCR
5. OCR result is passed through the Lookup pipeline
6. Lookup Popup appears with the Lookup Result

### F3 — Lookup Pipeline
Given a text string (word, phrase, or sentence), returns a Lookup Result.

**Word/phrase path:**
1. Query IndexedDB for reading + part-of-speech + common flag (JMdict)
2. Query IndexedDB for pitch accent (Kanjium, matched by word+reading)
3. Call Tatoeba API for up to 3 JP↔ZH example sentences
4. Call LLM for: Chinese translation, Japanese monolingual definition, conjugations
5. Assemble and return Lookup Result

**Sentence path:**
1. Call LLM for: Chinese translation of the full sentence + key vocabulary highlights
2. Return simplified Lookup Result (no pitch accent, no conjugations, no examples)

**Fallback (no API Key):**
- Return bundled data only: reading, part-of-speech, pitch accent
- Show a prompt to set up an API Key to get Chinese translation and definition

### F4 — Lookup Popup
- Floating panel near selected text / screen clip region
- Smart repositioning: stays within viewport, flips sides if needed
- Displays full Lookup Result
- "Save as Card" button (saves to Deck)
- "×" to dismiss
- Keyboard: Escape to dismiss

### F5 — Vocabulary Card & Deck
- Saved Lookup Results stored as Vocabulary Cards in IndexedDB
- **Collapsed view:** word + reading (furigana) + Chinese translation + JLPT level
- **Expanded view:** all fields — definition, part-of-speech, pitch accent, conjugations, example sentences with Chinese translations

### F6 — Deck View
- Accessible via extension popup (toolbar icon)
- Scrollable list of Vocabulary Cards, most recent first
- Click any card to toggle expanded/collapsed
- Search/filter by word (nice-to-have, not required for v1)
- "Export CSV" button at top — downloads all cards as a UTF-8 CSV

### F7 — CSV Export
All fields per card: word, reading, JLPT level, part-of-speech, pitch accent, Chinese translation, Japanese definition, conjugations, example sentences (pipe-separated), date saved.

### F8 — Settings Page
- API Key input — stored in `chrome.storage.local`
  - Supports Groq (free, key starts with `gsk_`), Google AI Studio (free, key starts with `AIzaSy` or `AQ.`), and OpenRouter (key starts with `sk-or-`)
  - Provider is auto-detected from the key prefix — user just pastes their key, no dropdown needed
  - Instructions for getting a free key from Groq or Google AI Studio
- Attribution credits (JMdict/EDRDG, Kanjium, Tatoeba)
- "Clear all cards" danger button

---

## Lookup Result Schema

```typescript
interface LookupResult {
  input: string;           // the original queried text
  type: 'word' | 'sentence';

  // Word fields (populated for word lookups)
  reading?: string;        // hiragana/katakana
  jlptLevel?: 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | null;
  partOfSpeech?: string;
  pitchAccent?: number;    // mora drop position (0 = heiban)
  jaDefinition?: string;   // Japanese monolingual definition (LLM)
  zhTranslation?: string;  // Chinese translation (LLM)
  conjugations?: Record<string, string>; // e.g. { te: '食べて', negative: '食べない' }
  exampleSentences?: Array<{ jp: string; zh: string }>;

  // Sentence fields
  sentenceTranslation?: string; // full Chinese translation (LLM)
  keyVocabulary?: Array<{ word: string; zhMeaning: string }>;

  source: 'full' | 'bundled-only'; // whether LLM was available
}
```

---

## Vocabulary Card Schema

```typescript
interface VocabularyCard {
  id: string;              // uuid
  savedAt: string;         // ISO 8601
  input: string;
  type: 'word' | 'sentence';
  reading?: string;
  jlptLevel?: string;
  partOfSpeech?: string;
  pitchAccent?: number;
  jaDefinition?: string;
  zhTranslation?: string;
  conjugations?: Record<string, string>;
  exampleSentences?: Array<{ jp: string; zh: string }>;
  sentenceTranslation?: string;
}
```

---

## Non-Goals (v1)

- No SRS / spaced repetition scheduling
- No sync across devices (local only)
- No Anki export (only CSV)
- No other language pairs beyond Japanese → Chinese
- No audio pronunciation
- No conjugation drill mode
- No furigana overlay on arbitrary webpages

---

## Open Questions (to resolve during implementation)

1. **JLPT level data source:** ✅ Resolved — bundled Jonathan Waller's community JLPT word list as a compact JSON map (Issue #3).

2. **Default LLM provider:** ✅ Resolved — no default needed. The provider is auto-detected from the API key prefix. Users obtain a free key from Groq (`groq.com`) or Google AI Studio (`aistudio.google.com`) and paste it into Settings. The extension handles the rest.

3. **Dictionary data install strategy:** ✅ Resolved — downloaded at runtime on first install from GitHub Releases (JMdict) and raw GitHub URL (Kanjium). Extension bundle stays small (Issue #2).
