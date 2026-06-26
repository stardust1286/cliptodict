/**
 * screen-clip-background.ts — Issue #8.
 *
 * Background-side handler for the CAPTURE_AND_LOOKUP message sent by
 * ClipOverlay.tsx when the user finishes drawing a selection rectangle.
 *
 * Wire up in background.ts inside the onMessage listener:
 *
 *   import { handleCaptureAndLookup } from '../src/lib/screen-clip-background';
 *
 *   chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
 *     if (message.type === 'CAPTURE_AND_LOOKUP') {
 *       handleCaptureAndLookup(message, sender, sendResponse);
 *       return true; // keep the channel open for the async response
 *     }
 *     // ... other handlers
 *   });
 */

import { cropImage } from './image-crop';
import { getOcrText } from './lookup-llm';
import { lookup } from './lookup';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CaptureAndLookupMessage {
  type: 'CAPTURE_AND_LOOKUP';
  rect: { x: number; y: number; width: number; height: number };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Handles a CAPTURE_AND_LOOKUP message from the content script.
 *
 * Flow:
 * 1. Capture the visible tab as a PNG via chrome.tabs.captureVisibleTab.
 * 2. Crop to the requested physical-pixel rect.
 * 3. OCR the cropped image with the user's LLM API key.
 * 4. Run the full lookup pipeline on the extracted text.
 * 5. Call sendResponse with the LookupResult, or { error: string } on failure.
 *
 * Returns void — the async work runs in a self-invoking IIFE so the outer
 * onMessage listener can immediately return `true` to keep the response
 * channel open.
 */
export function handleCaptureAndLookup(
  message: CaptureAndLookupMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): void {
  (async () => {
    try {
      const windowId = sender.tab?.windowId;
      if (windowId == null) {
        sendResponse({ error: 'No window ID' });
        return;
      }

      // Capture the full visible tab at the moment the user released the mouse.
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });

      // Crop to the bounding box the user drew (coordinates are already in
      // physical pixels — ClipOverlay multiplies by devicePixelRatio before sending).
      const cropped = await cropImage(dataUrl, message.rect);

      // Retrieve the API key from extension storage.
      const settings = await chrome.storage.local.get('apiKey') as { apiKey?: string };
      if (!settings.apiKey) {
        sendResponse({ error: 'no-api-key' });
        return;
      }

      // OCR: extract Japanese text from the cropped screenshot region.
      const ocrText = await getOcrText(cropped, settings.apiKey);
      if (!ocrText.trim()) {
        sendResponse({ error: 'No text found in image' });
        return;
      }

      // Full lookup pipeline (dictionary + LLM).
      const result = await lookup(ocrText, settings.apiKey);
      sendResponse(result);
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : 'Capture failed' });
    }
  })();
}
