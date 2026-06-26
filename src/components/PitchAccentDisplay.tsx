import React from 'react';

interface PitchAccentDisplayProps {
  reading: string;   // e.g. "たべる"
  position: number;  // mora drop position (0 = heiban/flat)
}

// Small kana that attach to the previous mora (digraphs / sokuon)
const COMBINING_KANA = new Set([
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ',
  'っ',
  'ゃ', 'ゅ', 'ょ',
  'ァ', 'ィ', 'ゥ', 'ェ', 'ォ',
  'ッ',
  'ャ', 'ュ', 'ョ',
]);

/**
 * Split a kana string into morae.
 * Each mora is one base character optionally followed by combining small kana.
 */
function splitIntoMorae(reading: string): string[] {
  const morae: string[] = [];
  let i = 0;
  while (i < reading.length) {
    const ch = reading[i];
    // Skip the case where a combining kana appears at the start (treat as own mora)
    let mora = ch;
    i++;
    // Greedily attach any following combining kana
    while (i < reading.length && COMBINING_KANA.has(reading[i])) {
      mora += reading[i];
      i++;
    }
    morae.push(mora);
  }
  return morae;
}

/**
 * Compute the pitch (true = high, false = low) for each mora.
 *
 * Rules (standard Tokyo pitch accent):
 *   position 0 (heiban):  L H H H H …  (low first, rest high, never drops)
 *   position 1 (atamadaka): H L L L L …
 *   position N (2+):      L H … H L L  (low, high up to and including mora N-1, low from N)
 */
function computePitches(moraeCount: number, position: number): boolean[] {
  return Array.from({ length: moraeCount }, (_, i) => {
    if (position === 0) {
      // heiban: first mora low, rest high
      return i !== 0;
    }
    if (position === 1) {
      // atamadaka: first mora high, rest low
      return i === 0;
    }
    // nakadaka / odaka: low first, high until drop at position
    return i >= 1 && i < position;
  });
}

const PitchAccentDisplay: React.FC<PitchAccentDisplayProps> = ({ reading, position }) => {
  const morae = splitIntoMorae(reading);
  const pitches = computePitches(morae.length, position);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0',
    marginTop: '6px',
    marginBottom: '4px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  return (
    <div style={containerStyle}>
      {morae.map((mora, idx) => {
        const isHigh = pitches[idx];
        const nextIsHigh = idx + 1 < morae.length ? pitches[idx + 1] : false;

        // We draw a top border when this mora is HIGH.
        // We draw a right connector line when this mora and next are both HIGH.
        const moraBoxStyle: React.CSSProperties = {
          position: 'relative',
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          fontSize: '13px',
          lineHeight: '1.4',
          padding: '2px 3px 0',
          borderTop: isHigh ? '2px solid #4f46e5' : '2px solid transparent',
          // Right side connector: draw only between two consecutive high morae
          borderRight: isHigh && nextIsHigh ? '2px solid #4f46e5' : '2px solid transparent',
          color: '#1e1e2e',
          minWidth: '18px',
          textAlign: 'center',
        };

        // Downstep marker: high mora followed by low (or end of word with odaka/nakadaka)
        const hasDownstep =
          isHigh &&
          !nextIsHigh &&
          idx + 1 < morae.length; // only show inside the word, not after last mora

        return (
          <div key={idx} style={moraBoxStyle}>
            {mora}
            {hasDownstep && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: '-6px',
                  top: '-2px',
                  width: '4px',
                  height: '10px',
                  borderRight: '2px solid #4f46e5',
                  borderBottom: '2px solid #4f46e5',
                  borderRadius: '0 0 2px 0',
                }}
              />
            )}
          </div>
        );
      })}
      <span
        style={{
          fontSize: '11px',
          color: '#6b7280',
          marginLeft: '6px',
          alignSelf: 'center',
          paddingBottom: '2px',
        }}
      >
        [{position}]
      </span>
    </div>
  );
};

export default PitchAccentDisplay;
