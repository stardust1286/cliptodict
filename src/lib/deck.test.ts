import { describe, it, expect } from 'vitest';
import { exportCsv } from './deck';
import type { VocabularyCard } from '../types/domain';

const WORD_CARD: VocabularyCard = {
  id: 'id-1',
  savedAt: '2026-01-01T00:00:00.000Z',
  input: '食べる',
  type: 'word',
  reading: 'たべる',
  jlptLevel: 'N5',
  partOfSpeech: 'Ichidan verb',
  pitchAccent: 2,
  jaDefinition: '食物を口に入れて飲み込む。',
  zhTranslation: '吃',
  conjugations: { masu: '食べます', te: '食べて' },
  exampleSentences: [{ jp: '私は食べる。', zh: '我吃。' }],
};

describe('exportCsv', () => {
  it('includes every PRD F7 field in the header', () => {
    const header = exportCsv([]).split('\r\n')[0];
    // PRD F7 requires all of these columns to be present.
    for (const col of [
      'reading',
      'jlptLevel',
      'partOfSpeech',
      'pitchAccent',
      'zhTranslation',
      'jaDefinition',
      'conjugations',
      'exampleSentences',
      'savedAt',
    ]) {
      expect(header).toContain(col);
    }
  });

  it('serializes pitch accent, definition, conjugations and examples for a word card', () => {
    const row = exportCsv([WORD_CARD]).split('\r\n')[1];
    expect(row).toContain('2'); // pitchAccent
    expect(row).toContain('食物を口に入れて飲み込む。'); // jaDefinition
    expect(row).toContain('masu:食べます'); // conjugations, pipe-separated form:value
    expect(row).toContain('私は食べる。 / 我吃。'); // exampleSentences, jp / zh
  });

  it('escapes fields containing commas by quoting them', () => {
    const card = { ...WORD_CARD, zhTranslation: '吃,食用' };
    const row = exportCsv([card]).split('\r\n')[1];
    expect(row).toContain('"吃,食用"');
  });
});
