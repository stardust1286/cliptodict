import { createShadowRootUi } from 'wxt/client';
import { createRoot } from 'react-dom/client';
import React from 'react';
import SelectionButton from '../src/components/SelectionButton';
import LookupPopup from '../src/components/LookupPopup';
import ClipOverlay from '../src/components/ClipOverlay';
import type { LookupResult } from '../src/types/domain';

const JAPANESE_RANGE = /[぀-鿿]/;

function containsJapanese(text: string): boolean {
  return JAPANESE_RANGE.test(text);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  async main(ctx) {
    let selectionButtonUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let lookupPopupUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let clipOverlayUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;

    let popupPosition = { x: 0, y: 0 };
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Dismiss helpers ─────────────────────────────────────────────────────────

    function removeSelectionButton() {
      if (selectionButtonUi) {
        selectionButtonUi.remove();
        selectionButtonUi = null;
      }
    }

    function removeLookupPopup() {
      if (lookupPopupUi) {
        lookupPopupUi.remove();
        lookupPopupUi = null;
      }
    }

    function removeClipOverlay() {
      if (clipOverlayUi) {
        clipOverlayUi.remove();
        clipOverlayUi = null;
      }
    }

    // ── Show/update popup ────────────────────────────────────────────────────────

    async function showLookupPopup(
      result: LookupResult | null,
      loading: boolean,
      error: string | null,
    ) {
      if (lookupPopupUi) {
        lookupPopupUi.remove();
        lookupPopupUi = null;
      }

      const pos = { ...popupPosition };

      lookupPopupUi = await createShadowRootUi(ctx, {
        name: 'cliptodict-lookup-popup',
        position: 'overlay',
        zIndex: 999999,
        onMount(container) {
          const mountPoint = document.createElement('div');
          container.appendChild(mountPoint);
          const root = createRoot(mountPoint);
          root.render(
            React.createElement(LookupPopup, {
              result,
              loading,
              error,
              position: pos,
              onDismiss: removeLookupPopup,
              onSave: (r: LookupResult) => {
                chrome.runtime.sendMessage({ type: 'SAVE_CARD', result: r });
              },
            }),
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      lookupPopupUi.mount();
    }

    // ── Selection button click handler ───────────────────────────────────────────

    async function handleSelectionButtonClick(text: string) {
      removeSelectionButton();
      await showLookupPopup(null, true, null);

      chrome.runtime.sendMessage(
        { type: 'LOOKUP', text },
        (response: LookupResult | { error: string } | undefined) => {
          if (!response) {
            void showLookupPopup(null, false, 'No response from background');
            return;
          }
          if ('error' in response) {
            void showLookupPopup(null, false, response.error);
          } else {
            void showLookupPopup(response, false, null);
          }
        },
      );
    }

    // ── Mouse-up handler: detect Japanese selection ──────────────────────────────

    function handleMouseUp(e: MouseEvent) {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';

        if (!text || !containsJapanese(text)) {
          return;
        }

        if (!sel || sel.rangeCount === 0) {
          return;
        }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const x = rect.right + 8;
        const y = rect.top;
        popupPosition = { x, y };

        void mountSelectionButton(text, { x, y });
      }, 150);

      // suppress unused warning
      void e;
    }

    async function mountSelectionButton(text: string, position: { x: number; y: number }) {
      removeSelectionButton();

      selectionButtonUi = await createShadowRootUi(ctx, {
        name: 'cliptodict-selection-button',
        position: 'overlay',
        zIndex: 999999,
        onMount(container) {
          const mountPoint = document.createElement('div');
          container.appendChild(mountPoint);
          const root = createRoot(mountPoint);
          root.render(
            React.createElement(SelectionButton, {
              position,
              onClick: () => void handleSelectionButtonClick(text),
            }),
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      selectionButtonUi.mount();
    }

    // ── Dismiss on mousedown outside button ──────────────────────────────────────

    function handleDocumentMouseDown() {
      removeSelectionButton();
    }

    // ── Dismiss on Escape ────────────────────────────────────────────────────────

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        removeSelectionButton();
        removeLookupPopup();
        removeClipOverlay();
      }
    }

    // ── Screen clip mode ─────────────────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'ACTIVATE_CLIP_MODE') {
        void (async () => {
          removeClipOverlay();

          clipOverlayUi = await createShadowRootUi(ctx, {
            name: 'cliptodict-clip-overlay',
            position: 'overlay',
            zIndex: 999998,
            onMount(container) {
              const mountPoint = document.createElement('div');
              container.appendChild(mountPoint);
              const root = createRoot(mountPoint);
              root.render(
                React.createElement(ClipOverlay, {
                  onDismiss: removeClipOverlay,
                  onLookupResult: (result: LookupResult) => {
                    removeClipOverlay();
                    void showLookupPopup(result, false, null);
                  },
                }),
              );
              return root;
            },
            onRemove(root) {
              root?.unmount();
            },
          });
          clipOverlayUi.mount();
        })();
      }
    });

    // ── Register listeners ────────────────────────────────────────────────────────

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup when content script context is invalidated
    ctx.onInvalidated(() => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      removeSelectionButton();
      removeLookupPopup();
      removeClipOverlay();
    });
  },
});
