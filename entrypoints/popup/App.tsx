import React, { useState } from 'react';

type Tab = 'deck' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('deck');

  return (
    <div className="flex flex-col h-full bg-white text-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">ClipToDict</span>
          <span className="text-xs bg-indigo-500 rounded px-1.5 py-0.5 font-mono">v0.1</span>
        </div>
        <nav className="flex gap-1">
          <button
            onClick={() => setTab('deck')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              tab === 'deck'
                ? 'bg-white text-indigo-700'
                : 'text-indigo-100 hover:bg-indigo-500'
            }`}
          >
            Deck
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              tab === 'settings'
                ? 'bg-white text-indigo-700'
                : 'text-indigo-100 hover:bg-indigo-500'
            }`}
          >
            Settings
          </button>
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'deck' ? (
          <DeckPlaceholder />
        ) : (
          <SettingsPlaceholder />
        )}
      </main>
    </div>
  );
}

function DeckPlaceholder() {
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

function SettingsPlaceholder() {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">Settings</h2>
      <p className="text-sm text-gray-500">
        API key and preferences will appear here (Issue #11).
      </p>
      <div className="mt-6 border-t pt-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attribution</h3>
        <ul className="space-y-1 text-xs text-gray-400">
          <li>JMdict/EDRDG — CC BY-SA 4.0</li>
          <li>Kanjium / Uros O. — CC BY-SA 4.0</li>
          <li>Tatoeba — CC BY 2.0 FR</li>
        </ul>
      </div>
    </div>
  );
}
