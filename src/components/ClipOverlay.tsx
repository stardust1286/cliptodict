/**
 * ClipOverlay — full-page selection overlay for screen clip mode (Issue #8).
 *
 * Renders a fixed overlay that lets the user draw a bounding box around
 * Japanese text. On mouse-up (if the rect is large enough) it sends a
 * CAPTURE_AND_LOOKUP message to the background service worker and forwards
 * the result via onLookupResult.
 *
 * Uses ONLY inline styles so it works correctly inside a shadow DOM host.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LookupResult } from '../types/domain';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClipOverlayProps {
  onDismiss: () => void;
  onLookupResult: (result: LookupResult) => void;
}

type State = 'idle' | 'drawing' | 'captured' | 'done';

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise two corner points into an x/y/width/height rect (no negative dims). */
function makeRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClipOverlay({ onDismiss, onLookupResult }: ClipOverlayProps) {
  const [state, setState] = useState<State>('idle');
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);

  // Keep a ref to onDismiss so the keydown listener never captures a stale closure.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Escape key dismisses the overlay.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onDismissRef.current();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (state !== 'idle') return;
      e.preventDefault();
      setStart({ x: e.clientX, y: e.clientY });
      setCurrent({ x: e.clientX, y: e.clientY });
      setState('drawing');
    },
    [state],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (state !== 'drawing') return;
      setCurrent({ x: e.clientX, y: e.clientY });
    },
    [state],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (state !== 'drawing' || start === null) return;

      const end: Point = { x: e.clientX, y: e.clientY };
      const rect = makeRect(start, end);

      // Ignore accidental tiny drags.
      if (rect.width <= 10 || rect.height <= 10) {
        setState('idle');
        setStart(null);
        setCurrent(null);
        return;
      }

      setState('captured');

      // Scale to physical pixels for captureVisibleTab (which returns physical pixels).
      const dpr = window.devicePixelRatio ?? 1;
      const physicalRect = {
        x: Math.round(rect.x * dpr),
        y: Math.round(rect.y * dpr),
        width: Math.round(rect.width * dpr),
        height: Math.round(rect.height * dpr),
      };

      chrome.runtime.sendMessage(
        { type: 'CAPTURE_AND_LOOKUP', rect: physicalRect },
        (response: unknown) => {
          setState('done');

          // If chrome runtime error or response is an error object, just dismiss.
          if (chrome.runtime.lastError || !response) {
            onDismissRef.current();
            return;
          }

          const resp = response as Record<string, unknown>;

          if (typeof resp.error === 'string') {
            // Signal error but don't crash — just dismiss.
            console.warn('[ClipToDict] CAPTURE_AND_LOOKUP error:', resp.error);
            onDismissRef.current();
            return;
          }

          // Treat it as a LookupResult.
          onLookupResult(response as LookupResult);
          onDismissRef.current();
        },
      );
    },
    [state, start, onLookupResult],
  );

  // ── Derived selection rect (CSS coords) ────────────────────────────────────

  const selectionRect =
    state === 'drawing' && start !== null && current !== null
      ? makeRect(start, current)
      : null;

  // ── Styles (all inline — no Tailwind) ──────────────────────────────────────

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 999998,
    cursor: state === 'captured' || state === 'done' ? 'wait' : 'crosshair',
    background: 'rgba(0, 0, 0, 0.15)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  const hintStyle: React.CSSProperties = {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0, 0, 0, 0.65)',
    color: '#fff',
    fontSize: '13px',
    lineHeight: '1.4',
    padding: '6px 14px',
    borderRadius: '6px',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  };

  const capturingStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    fontSize: '15px',
    padding: '10px 22px',
    borderRadius: '8px',
    pointerEvents: 'none',
  };

  return (
    <div
      style={overlayStyle}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Hint bar */}
      {(state === 'idle' || state === 'drawing') && (
        <div style={hintStyle}>
          Draw a box around the text to look up — Esc to cancel
        </div>
      )}

      {/* Selection rectangle */}
      {selectionRect !== null && (
        <div
          style={{
            position: 'fixed',
            left: `${selectionRect.x}px`,
            top: `${selectionRect.y}px`,
            width: `${selectionRect.width}px`,
            height: `${selectionRect.height}px`,
            border: '2px dashed #4f46e5',
            background: 'rgba(79, 70, 229, 0.1)',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Capturing indicator */}
      {(state === 'captured' || state === 'done') && (
        <div style={capturingStyle}>Capturing…</div>
      )}
    </div>
  );
}
