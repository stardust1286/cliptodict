import { useState, useEffect, useCallback } from 'react';
import { detectProvider } from '../lib/llm';
import { clearAllCards } from '../lib/deck';

type Provider = 'groq' | 'google' | 'openrouter';

function providerLabel(provider: Provider): string {
  switch (provider) {
    case 'groq':       return 'Groq key detected ✓';
    case 'google':     return 'Google AI Studio key detected ✓';
    case 'openrouter': return 'OpenRouter key detected ✓';
  }
}

export default function SettingsView() {
  const [apiKey, setApiKey] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('apiKey', (result: Record<string, unknown>) => {
      const stored = result['apiKey'];
      if (typeof stored === 'string') {
        setApiKey(stored);
      }
    });
  }, []);

  const handleSave = useCallback(() => {
    chrome.storage.local.set({ apiKey }, () => {
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 1500);
    });
  }, [apiKey]);

  const handleClearConfirmed = useCallback(async () => {
    await clearAllCards();
    window.dispatchEvent(new CustomEvent('cliptodict:clear-deck'));
    setConfirmClear(false);
  }, []);

  const detectedProvider = apiKey.length > 0 ? detectProvider(apiKey) : null;

  return (
    <div className="space-y-6">
      {/* API Key section */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">API Key</h2>
        <p className="text-xs text-gray-500">
          Required for translations. Supports Groq (free), Google AI Studio (free), and OpenRouter.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Paste your API key here"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {detectedProvider && (
          <p className="text-xs text-green-600 font-medium">
            {providerLabel(detectedProvider)}
          </p>
        )}
        <button
          onClick={handleSave}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
        >
          {savedFeedback ? 'Saved ✓' : 'Save'}
        </button>
      </section>

      {/* Free key links */}
      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Where to get a free key
        </h3>
        <ul className="space-y-1 text-xs text-gray-500">
          <li>
            <span className="font-medium text-gray-700">Groq (free):</span>{' '}
            groq.com
          </li>
          <li>
            <span className="font-medium text-gray-700">Google AI Studio (free):</span>{' '}
            aistudio.google.com
          </li>
        </ul>
      </section>

      {/* Attribution */}
      <section className="border-t pt-4 space-y-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Attribution
        </h3>
        <ul className="space-y-1 text-xs text-gray-400">
          <li>JMdict/EDRDG — CC BY-SA 4.0</li>
          <li>Kanjium / Uros O. — CC BY-SA 4.0</li>
          <li>Tatoeba — CC BY 2.0 FR</li>
        </ul>
      </section>

      {/* Danger zone */}
      <section className="border-t pt-4 space-y-2">
        <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide">
          Danger Zone
        </h3>
        {confirmClear ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleClearConfirmed}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
              >
                Yes, delete all
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="px-3 py-1.5 border border-red-400 text-red-600 text-xs font-medium rounded hover:bg-red-50 transition-colors"
          >
            Clear All Cards
          </button>
        )}
      </section>
    </div>
  );
}
