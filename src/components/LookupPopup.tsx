import React, { useState, useEffect, useRef } from 'react';
import type { LookupResult } from '../types/domain';
import PitchAccentDisplay from './PitchAccentDisplay';

export interface LookupPopupProps {
  result: LookupResult | null;
  loading: boolean;
  error: string | null;
  position: { x: number; y: number };
  onDismiss: () => void;
  onSave: (result: LookupResult) => void;
}

// ─── JLPT badge colors ────────────────────────────────────────────────────────

const JLPT_COLORS: Record<string, { bg: string; color: string }> = {
  N5: { bg: '#dcfce7', color: '#166534' },
  N4: { bg: '#ccfbf1', color: '#134e4a' },
  N3: { bg: '#dbeafe', color: '#1e3a8a' },
  N2: { bg: '#f3e8ff', color: '#581c87' },
  N1: { bg: '#fee2e2', color: '#7f1d1d' },
};

// ─── Styles (all inline, no Tailwind) ─────────────────────────────────────────

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 480;

// ─── Sub-components ───────────────────────────────────────────────────────────

const Badge: React.FC<{ label: string; bg: string; color: string }> = ({
  label,
  bg,
  color,
}) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      backgroundColor: bg,
      color,
      lineHeight: '18px',
    }}
  >
    {label}
  </span>
);

const Spinner: React.FC = () => (
  <div
    style={{
      width: '20px',
      height: '20px',
      border: '2px solid #e5e7eb',
      borderTopColor: '#4f46e5',
      borderRadius: '50%',
      animation: 'cliptodict-spin 0.7s linear infinite',
    }}
  />
);

// Inject keyframe animation once
function ensureSpinnerAnimation(): void {
  const id = 'cliptodict-spinner-style';
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent =
      '@keyframes cliptodict-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

const LookupPopup: React.FC<LookupPopupProps> = ({
  result,
  loading,
  error,
  position,
  onDismiss,
  onSave,
}) => {
  const [conjugationsOpen, setConjugationsOpen] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Clamp position to viewport
  const [clampedPos, setClampedPos] = useState(position);

  useEffect(() => {
    ensureSpinnerAnimation();
  }, []);

  useEffect(() => {
    setConjugationsOpen(false);
    setSavedFeedback(false);
  }, [result]);

  useEffect(() => {
    if (!popupRef.current) {
      setClampedPos(position);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = position;

    if (x + POPUP_WIDTH > vw - 8) {
      x = Math.max(8, vw - POPUP_WIDTH - 8);
    }
    if (y + POPUP_MAX_HEIGHT > vh - 8) {
      y = Math.max(8, vh - POPUP_MAX_HEIGHT - 8);
    }
    setClampedPos({ x, y });
  }, [position]);

  function handleSave(): void {
    if (!result) return;
    onSave(result);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1000);
  }

  // ── Shared outer wrapper styles ──────────────────────────────────────────────

  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${clampedPos.x}px`,
    top: `${clampedPos.y}px`,
    width: `${POPUP_WIDTH}px`,
    maxHeight: `${POPUP_MAX_HEIGHT}px`,
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow:
      '0 4px 6px -1px rgba(0,0,0,0.10), 0 10px 15px -3px rgba(0,0,0,0.10)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    color: '#111827',
    zIndex: 2147483647,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const headerBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '8px 12px 0',
  };

  const closeButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    color: '#6b7280',
    padding: '2px 4px',
    lineHeight: 1,
    borderRadius: '4px',
  };

  const scrollAreaStyle: React.CSSProperties = {
    overflowY: 'auto',
    padding: '0 16px 16px',
    flex: 1,
  };

  const footerStyle: React.CSSProperties = {
    borderTop: '1px solid #f3f4f6',
    padding: '10px 16px',
    display: 'flex',
    justifyContent: 'flex-end',
  };

  const saveButtonStyle: React.CSSProperties = {
    padding: '5px 16px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    backgroundColor: savedFeedback ? '#16a34a' : '#4f46e5',
    color: '#ffffff',
    transition: 'background-color 0.2s',
  };

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        ref={popupRef}
        style={popupStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerBarStyle}>
          <button style={closeButtonStyle} onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '16px',
            color: '#6b7280',
          }}
        >
          <Spinner />
          <span>Looking up…</span>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────

  if (error) {
    const isNoApiKey = error === 'no-api-key';
    return (
      <div
        ref={popupRef}
        style={popupStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerBarStyle}>
          <button style={closeButtonStyle} onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>
        <div style={{ padding: '8px 16px 16px' }}>
          {isNoApiKey ? (
            <p
              style={{
                margin: 0,
                color: '#92400e',
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
            >
              Add an API key in the extension popup to enable translations.
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                color: '#dc2626',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── No result ────────────────────────────────────────────────────────────────

  if (!result) return null;

  // ── Word result ──────────────────────────────────────────────────────────────

  if (result.type === 'word') {
    const jlptStyle =
      result.jlptLevel && JLPT_COLORS[result.jlptLevel]
        ? JLPT_COLORS[result.jlptLevel]
        : null;

    const conjugationEntries = result.conjugations
      ? Object.entries(result.conjugations)
      : [];

    const exampleSentences = result.exampleSentences
      ? result.exampleSentences.slice(0, 3)
      : [];

    return (
      <div
        ref={popupRef}
        style={popupStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div style={headerBarStyle}>
          <button style={closeButtonStyle} onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={scrollAreaStyle}>

          {/* 1. Header: word + reading + badges */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: '6px',
              marginBottom: '6px',
            }}
          >
            <span
              style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1.2 }}
            >
              {result.input}
            </span>
            {result.reading && (
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                ({result.reading})
              </span>
            )}
            {jlptStyle && result.jlptLevel && (
              <Badge
                label={result.jlptLevel}
                bg={jlptStyle.bg}
                color={jlptStyle.color}
              />
            )}
            {result.source === 'full' && (
              <Badge label="common" bg="#f3f4f6" color="#374151" />
            )}
          </div>

          {/* 2. Chinese translation */}
          {result.zhTranslation && (
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#4338ca',
                marginBottom: '4px',
                lineHeight: 1.4,
              }}
            >
              {result.zhTranslation}
            </div>
          )}

          {/* 3. Part of speech */}
          {result.partOfSpeech && (
            <div
              style={{
                fontSize: '12px',
                color: '#9ca3af',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {result.partOfSpeech}
            </div>
          )}

          {/* 4. Pitch accent */}
          {result.reading !== undefined && result.pitchAccent !== undefined && (
            <PitchAccentDisplay
              reading={result.reading}
              position={result.pitchAccent}
            />
          )}

          {/* 5. Japanese definition */}
          {result.jaDefinition && (
            <div
              style={{
                margin: '8px 0',
                padding: '8px 10px',
                backgroundColor: '#f9fafb',
                borderLeft: '3px solid #e5e7eb',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#374151',
                lineHeight: '1.6',
              }}
            >
              {result.jaDefinition}
            </div>
          )}

          {/* 6. Conjugations */}
          {conjugationEntries.length > 0 && (
            <div style={{ margin: '8px 0' }}>
              <button
                onClick={() => setConjugationsOpen((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 0',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#4b5563',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Conjugations
                <span style={{ fontSize: '10px' }}>
                  {conjugationsOpen ? '▴' : '▾'}
                </span>
              </button>
              {conjugationsOpen && (
                <table
                  style={{
                    marginTop: '6px',
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                  }}
                >
                  <tbody>
                    {conjugationEntries.map(([form, conjugated]) => (
                      <tr key={form}>
                        <td
                          style={{
                            padding: '3px 8px 3px 0',
                            color: '#6b7280',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top',
                            width: '45%',
                          }}
                        >
                          {form}
                        </td>
                        <td
                          style={{
                            padding: '3px 0',
                            color: '#111827',
                            fontWeight: 500,
                          }}
                        >
                          {conjugated}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 7. Example sentences */}
          {exampleSentences.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Examples
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {exampleSentences.map((sentence, i) => (
                  <div
                    key={i}
                    style={{
                      borderLeft: '2px solid #e0e7ff',
                      paddingLeft: '8px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#111827',
                        lineHeight: '1.5',
                      }}
                    >
                      {sentence.jp}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        lineHeight: '1.5',
                        marginTop: '2px',
                      }}
                    >
                      {sentence.zh}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Save button */}
        <div style={footerStyle}>
          <button style={saveButtonStyle} onClick={handleSave}>
            {savedFeedback ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  // ── Sentence result ──────────────────────────────────────────────────────────

  const truncatedInput =
    result.input.length > 30
      ? result.input.slice(0, 30) + '…'
      : result.input;

  return (
    <div
      ref={popupRef}
      style={popupStyle}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <div style={headerBarStyle}>
        <button style={closeButtonStyle} onClick={onDismiss} aria-label="Close">
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div style={scrollAreaStyle}>

        {/* 1. Truncated input */}
        <div
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#111827',
            marginBottom: '6px',
            lineHeight: 1.4,
            wordBreak: 'break-all',
          }}
        >
          {truncatedInput}
        </div>

        {/* 2. Sentence translation */}
        {result.sentenceTranslation && (
          <div
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#4338ca',
              marginBottom: '10px',
              lineHeight: '1.5',
            }}
          >
            {result.sentenceTranslation}
          </div>
        )}

        {/* 3. Key vocabulary */}
        {result.keyVocabulary && result.keyVocabulary.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '6px',
              }}
            >
              Key Vocabulary
            </div>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              {result.keyVocabulary.map((item, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: '#111827',
                      fontSize: '14px',
                    }}
                  >
                    {item.word}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: '13px' }}>
                    {item.zhMeaning}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Save button */}
      <div style={footerStyle}>
        <button style={saveButtonStyle} onClick={handleSave}>
          {savedFeedback ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default LookupPopup;
