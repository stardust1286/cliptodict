import { useState, useEffect, useCallback } from 'react';
import type { VocabularyCard } from '../types/domain';
import { getCards, deleteCard, exportCsv } from '../lib/deck';

// ─── CardItem ─────────────────────────────────────────────────────────────────

interface CardItemProps {
  card: VocabularyCard;
  onDelete: (id: string) => void;
}

function CardItem({ card, onDelete }: CardItemProps) {
  const [expanded, setExpanded] = useState(false);

  async function handleDelete() {
    await deleteCard(card.id);
    onDelete(card.id);
  }

  const jlptBadge = card.jlptLevel ? (
    <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded shrink-0">
      {card.jlptLevel}
    </span>
  ) : null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Collapsed header — always visible, click to toggle */}
      <button
        className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{card.input}</span>
            {card.type === 'word' && card.reading && (
              <span className="text-xs text-gray-500">({card.reading})</span>
            )}
            {jlptBadge}
          </div>
          {card.type === 'word' && card.zhTranslation && (
            <p className="text-xs text-gray-600 mt-0.5 truncate">{card.zhTranslation}</p>
          )}
          {card.type === 'sentence' && card.sentenceTranslation && (
            <p className="text-xs text-gray-600 mt-0.5 truncate">{card.sentenceTranslation}</p>
          )}
        </div>
        <span className="text-gray-400 text-xs mt-0.5 shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-3 bg-gray-50 text-sm">
          {card.partOfSpeech && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Part of speech
              </span>
              <p className="text-gray-700 mt-0.5">{card.partOfSpeech}</p>
            </div>
          )}

          {card.type === 'word' && card.pitchAccent !== undefined && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Pitch accent
              </span>
              <p className="text-gray-700 mt-0.5">
                {card.pitchAccent === 0 ? 'Heiban (平板型)' : `Drop at mora ${card.pitchAccent}`}
              </p>
            </div>
          )}

          {card.jaDefinition && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Japanese definition
              </span>
              <p className="text-gray-700 mt-0.5 text-xs leading-relaxed">{card.jaDefinition}</p>
            </div>
          )}

          {card.type === 'word' && card.zhTranslation && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Chinese translation
              </span>
              <p className="text-gray-700 mt-0.5">{card.zhTranslation}</p>
            </div>
          )}

          {card.type === 'sentence' && card.sentenceTranslation && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Translation
              </span>
              <p className="text-gray-700 mt-0.5">{card.sentenceTranslation}</p>
            </div>
          )}

          {card.conjugations && Object.keys(card.conjugations).length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Conjugations
              </span>
              <table className="mt-1 w-full text-xs border-collapse">
                <tbody>
                  {Object.entries(card.conjugations).map(([form, value]) => (
                    <tr key={form} className="border-b border-gray-200 last:border-0">
                      <td className="py-0.5 pr-3 text-gray-500 capitalize w-1/3">{form}</td>
                      <td className="py-0.5 text-gray-800">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {card.exampleSentences && card.exampleSentences.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Example sentences
              </span>
              <ul className="mt-1 space-y-2">
                {card.exampleSentences.map((ex, i) => (
                  <li key={i} className="text-xs">
                    <p className="text-gray-800">{ex.jp}</p>
                    <p className="text-gray-500">{ex.zh}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {card.keyVocabulary && card.keyVocabulary.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Key vocabulary
              </span>
              <ul className="mt-1 space-y-1">
                {card.keyVocabulary.map((kv, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span className="text-gray-800 font-medium">{kv.word}</span>
                    <span className="text-gray-500">{kv.zhMeaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-1 border-t border-gray-200">
            <p className="text-xs text-gray-400 mb-2">
              Saved {new Date(card.savedAt).toLocaleString()}
            </p>
            <button
              onClick={handleDelete}
              className="text-xs text-red-500 hover:text-red-700 transition-colors font-medium"
            >
              Delete card
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DeckView ─────────────────────────────────────────────────────────────────

interface DeckViewProps {
  installing: boolean;
}

export default function DeckView({ installing }: DeckViewProps) {
  const [cards, setCards] = useState<VocabularyCard[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refreshCards = useCallback(async () => {
    const fetched = await getCards();
    setCards(fetched);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refreshCards();
  }, [refreshCards]);

  // Listen for new cards saved from the content script popup
  useEffect(() => {
    function handleCardSaved() {
      refreshCards();
    }
    window.addEventListener('cliptodict:card-saved', handleCardSaved);
    return () => window.removeEventListener('cliptodict:card-saved', handleCardSaved);
  }, [refreshCards]);

  function handleDelete(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  function handleExportCsv() {
    const csv = exportCsv(cards);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cliptodict-deck.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  if (installing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-12">
        <div className="text-4xl">📖</div>
        <p className="text-sm font-medium">Your deck is empty</p>
        <p className="text-xs text-center max-w-[200px] text-indigo-400">
          Setting up dictionary data — this only happens once.
        </p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-12">
        <div className="text-4xl">📖</div>
        <p className="text-sm font-medium">Your deck is empty</p>
        <p className="text-xs text-center max-w-[200px]">
          Select Japanese text on any webpage to look it up and save cards here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
        <button
          onClick={handleExportCsv}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors border border-indigo-200 hover:border-indigo-400 px-2.5 py-1 rounded"
        >
          Export CSV
        </button>
      </div>
      <div className="space-y-2">
        {cards.map((card) => (
          <CardItem key={card.id} card={card} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
