# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ClipToDict is a Manifest V3 Chrome extension that gives Japanese learners instant dictionary lookups, either by selecting text on a page or by drawing a box over a region of the screen (OCR via a vision LLM). Target language is Japanese; translations are Simplified Chinese. See `CONTEXT.md` for the full domain glossary (Lookup, Vocabulary Card, Deck, Screen Clip, etc.) — read it before touching domain logic; the terms there are used verbatim throughout the code.

## Commands

- `pnpm dev` — run the extension in dev mode (WXT, Chrome). `pnpm dev:firefox` for Firefox.
- `pnpm build` / `pnpm build:firefox` — production build into `.output/`.
- `pnpm zip` — package for store submission.
- `pnpm compile` — typecheck only (`tsc --noEmit`). TS is `strict` with `noUnusedLocals`/`noUnusedParameters`, so unused imports/vars fail the build.
- `pnpm lint` — ESLint.
- `pnpm test` — Vitest (run once). `pnpm test:watch` for watch mode.
  - Single file: `pnpm test src/lib/lookup.test.ts`
  - Single test by name: `pnpm test -t "sentence path"`

`pnpm install` runs `wxt prepare` (postinstall), which regenerates `.wxt/` (the generated tsconfig base and type defs). If type resolution looks broken after pulling, rerun it.

## Architecture

WXT (`wxt.dev`) owns all MV3 boilerplate. The three entrypoints live in `entrypoints/`; all reusable logic lives in `src/`. WXT auto-discovers entrypoints and provides the `defineBackground`/`defineContentScript`/`createShadowRootUi` globals — there is no manual manifest beyond `wxt.config.ts`.

### Three execution contexts

- **`entrypoints/background.ts`** — service worker. The hub: owns the `chrome.runtime.onMessage` router, all IndexedDB/LLM/network access, and the dictionary install. Runs the lookup pipeline and OCR because content scripts can't reach `chrome.tabs.captureVisibleTab`. Also registers the `screen-clip` keyboard command (Alt+Shift+S).
- **`entrypoints/content.ts`** — injected into `<all_urls>`. Detects Japanese text selections (debounced `mouseup`), renders UI via `createShadowRootUi` (isolated shadow DOM so page styles can't leak in), and handles the clip overlay. It does **no** lookups itself — it sends messages to the background and renders the response.
- **`entrypoints/popup/`** — React popup (Deck + Settings tabs). Reads install progress and the deck; writes the API key.

### Message passing is the spine

Content ↔ background communication is entirely `chrome.runtime.sendMessage`. Message `type` values currently routed in `background.ts`: `PING`, `GET_INSTALL_STATUS`, `RETRY_INSTALL`, `LOOKUP`, `SAVE_CARD`, `CAPTURE_AND_LOOKUP`. Background → content: `ACTIVATE_CLIP_MODE`. When adding a feature that needs privileged APIs, add a message type and a handler branch rather than trying to do the work in the content script. Async handlers must `return true` to keep the response channel open.

### The lookup pipeline (`src/lib/lookup.ts`)

`lookup(text, apiKey?)` is the single entry point. It first classifies the input as **word** vs **sentence** (`isSentence` — length + particle heuristic), then:
- **Word path:** phase 1 runs JMdict lookup + JLPT + Tatoeba examples in parallel; phase 2 (needs the reading from phase 1) runs pitch-accent + LLM word data in parallel. Falls back to the LLM's reading when the bundled dictionary doesn't know the word.
- **Sentence path:** LLM translation + key vocabulary only.
- **Bundled-only mode:** when no `apiKey` is present, all LLM calls are skipped and `result.source` is `'bundled-only'` instead of `'full'`. Every LLM call is wrapped in `.catch(() => null)` so a failed/absent LLM degrades gracefully rather than throwing.

### LLM client (`src/lib/llm.ts`)

Provider is auto-detected from the API key prefix (`gsk_`→Groq, `AIzaSy`/`AQ.`→Google, `sk-or-`→OpenRouter) — users never pick a provider. Each provider has one ordered model registry; each model declares a `Capability[]` (`'text'`/`'vision'`). Call-time selection filters by required capability and tries models in order, **silently skipping** model-level errors (4xx) and falling through to the next. Hard-stop errors (auth 401, rate-limit 429, timeout) are re-thrown immediately and never retried across models. To add a model, add one entry to the registry array; to add a capability (e.g. `'audio'`), extend the `Capability` union — no new config shape. Error classes carry **end-user-facing** messages.

### Storage: two IndexedDB databases + chrome.storage.local

- **`cliptodict-dict`** (`src/lib/db.ts`) — bundled dictionary: `jmdict` store (keyed by `word`, `reading` index) and `pitchAccent` store (keyed by `word+reading`). Populated once on install.
- **`cliptodict-deck`** (`src/lib/deck.ts`) — user's saved Vocabulary Cards (`cards` store, keyed by `id`). Owns its own DB open + CSV export (RFC 4180 escaping).
- **`chrome.storage.local`** — small key/value only: the user's `apiKey` and `dictInstallStatus` (see `install-status.ts`). The popup subscribes to status changes via `chrome.storage.onChanged`.

### Dictionary install (`src/lib/dict/install.ts`)

Runs on `onInstalled` **and** on every service-worker startup (workers can be killed mid-install). It is **idempotent** (skips if both stores are non-empty) and **resumable**. Downloads + parses two external sources at runtime — they are not bundled:
- JMdict: latest `jmdict-eng-common` zip, URL discovered live via the GitHub Releases API (`scriptin/jmdict-simplified`), unzipped with `fflate`.
- Pitch accent: Kanjium `accents.txt` raw from GitHub (`mifunetoshiro/kanjium`).

Inserts are chunked (`CHUNK_SIZE` 500) with `setTimeout(0)` yields between chunks to keep the worker responsive, and progress is streamed to `chrome.storage.local` for the popup banner.

## Conventions

- **Path aliases:** `@/*` maps to the repo root (`tsconfig.json`). `src/` modules import each other with relative paths.
- **`src/types/domain.ts`** is the single source of truth for `LookupResult`, `VocabularyCard`, `JMdictEntry`, `PitchAccentEntry`, `ExtensionSettings`. A `VocabularyCard` is a saved snapshot of a `LookupResult` (similar fields, plus `id`/`savedAt`).
- **Logging:** prefix console logs with `[ClipToDict]`.
- Tests are colocated as `*.test.ts` next to the module under test, run by Vitest.
