# ClipToDict — Domain Glossary

## Terms

### Lookup
A one-shot query for a word or short phrase, or a full sentence. Triggered either by **Text Selection** or **Screen Clip**. Returns a **Lookup Result**.

- **Word Lookup**: a single word or short phrase. Returns the full Lookup Result (reading, definition, translation, pitch accent, conjugations, example sentences, JLPT level).
- **Sentence Lookup**: a full sentence (e.g. from a YouTube subtitle). Returns a Chinese translation of the whole sentence plus highlighted key vocabulary. Only the sentence-level result can be saved as a Vocabulary Card.

### Text Selection
Capture mode where the user highlights text on a webpage with the cursor. The selected string becomes the **Lookup** query.

### Screen Clip
Capture mode where the user draws a bounding box over a region of the screen (e.g. a YouTube subtitle). The captured image is sent to a vision-capable LLM (via the user's API Key) for OCR. The extracted text becomes the Lookup query.

### Lookup Result
The full set of data returned for a Lookup: reading (furigana/kana), definition (Japanese monolingual), Chinese translation, part of speech, example sentences (with Chinese translation), JLPT level, pitch accent, and conjugations.

### Vocabulary Card
A saved Lookup Result. Has two views:
- **Collapsed View**: word + reading + Chinese translation + JLPT level.
- **Expanded View**: all Lookup Result fields.

### Deck
The user's full collection of Vocabulary Cards, stored in Chrome extension local storage.

### CSV Export
A file export of the entire Deck. Contains all fields of every Vocabulary Card.

### Lookup Popup
A floating panel that appears near the selected text or screen clip region. Displays the full Lookup Result. Repositions automatically to avoid overflowing screen edges.

### API Key
A user-supplied secret (Groq or OpenRouter) stored in `chrome.storage.local`. Entered once via the extension's Settings page. Required for LLM-powered fields (Chinese translation, Japanese monolingual definition, conjugations). If absent, the extension falls back to bundled-data-only mode.

### Deck View
The UI for browsing saved Vocabulary Cards. Cards are displayed in a scrollable list. Each card shows its Collapsed View by default; clicking expands to the Expanded View. No scheduling or quiz mode — passive, user-driven review.

## Primary Languages
- **Target language** (language being learned): Japanese
- **Native language** (language of translation): Chinese (Simplified)

## Tech Stack
- **Framework**: React (TypeScript)
- **Extension framework**: WXT (`wxt.dev`) — handles MV3 boilerplate (service worker, content scripts, popup)
- **Build tool**: Vite (via WXT)
- **Language**: TypeScript
