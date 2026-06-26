import React, { useEffect, useRef } from 'react';
import type { LookupResult } from '../types/domain';

interface LookupPopupProps {
  result: LookupResult | null;
  loading: boolean;
  error: string | null;
  position: { x: number; y: number };
  onDismiss: () => void;
  onSave: (result: LookupResult) => void;
}

export default function LookupPopup({
  result,
  loading,
  error,
  position,
  onDismiss,
  onSave,
}: LookupPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onDismiss();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onDismiss]);

  function handleSave() {
    if (result) {
      onSave(result);
      window.dispatchEvent(new CustomEvent('cliptodict:card-saved'));
    }
  }

  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    width: 300,
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    borderRadius: 10,
    padding: 16,
    zIndex: 999999,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    color: '#1f2937',
    lineHeight: 1.5,
  };

  return (
    <div ref={containerRef} style={cardStyle} onMouseDown={(e) => e.stopPropagation()}>
      {loading && (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: '8px 0' }}>
          Looking up…
        </div>
      )}

      {error && !loading && (
        <div style={{ color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && !loading && (
        <>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, marginRight: 8 }}>
              {result.input}
            </span>
            {result.reading && (
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {result.reading}
              </span>
            )}
          </div>

          {result.jlptLevel && (
            <div style={{ marginBottom: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: '#e0e7ff',
                  color: '#4f46e5',
                  borderRadius: 4,
                  padding: '1px 6px',
                  marginRight: 6,
                }}
              >
                {result.jlptLevel}
              </span>
              {result.partOfSpeech && (
                <span style={{ fontSize: 12, color: '#9ca3af' }}>
                  {result.partOfSpeech}
                </span>
              )}
            </div>
          )}

          {result.zhTranslation && (
            <div style={{ color: '#374151', marginBottom: 6 }}>
              {result.zhTranslation}
            </div>
          )}

          {result.sentenceTranslation && (
            <div style={{ color: '#374151', marginBottom: 6 }}>
              {result.sentenceTranslation}
            </div>
          )}

          {result.source === 'bundled-only' && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
              Add an API key for full definitions
            </div>
          )}

          <div style={{ marginTop: 10, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
            <button
              onClick={handleSave}
              style={{
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                marginRight: 8,
              }}
            >
              Save
            </button>
            <button
              onClick={onDismiss}
              style={{
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
