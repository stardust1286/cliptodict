import { useState, useEffect } from 'react';
import {
  getInstallStatus,
  onInstallStatusChange,
  type InstallStatus,
  type InstallPhase,
} from '../../src/lib/install-status';
import DeckView from '../../src/components/DeckView';

type Tab = 'deck' | 'settings';

// ─── Phase label helpers ──────────────────────────────────────────────────────

function phaseLabel(phase: InstallPhase): string {
  switch (phase) {
    case 'downloading-jmdict': return 'Downloading dictionary…';
    case 'indexing-jmdict':    return 'Indexing dictionary…';
    case 'downloading-pitch':  return 'Downloading pitch accent data…';
    case 'indexing-pitch':     return 'Indexing pitch accent data…';
    case 'error':              return 'Install failed';
    default:                   return 'Setting up…';
  }
}

// ─── Install progress banner ──────────────────────────────────────────────────

function InstallBanner({ status, onRetry }: { status: InstallStatus; onRetry: () => void }) {
  if (status.phase === 'done') return null;

  const isError = status.phase === 'error';
  const hasProgress = typeof status.progress === 'number';

  return (
    <div
      className={`px-4 py-3 text-xs flex flex-col gap-1 ${
        isError ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{phaseLabel(status.phase)}</span>
        {isError && (
          <button
            onClick={onRetry}
            className="text-xs underline text-red-600 hover:text-red-800"
          >
            Retry
          </button>
        )}
      </div>

      {isError && status.error && (
        <p className="text-red-500 truncate" title={status.error}>
          {status.error}
        </p>
      )}

      {!isError && hasProgress && (
        <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-200"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      )}

      {!isError && !hasProgress && (
        <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
          <div className="bg-indigo-400 h-full rounded-full animate-pulse w-1/2" />
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('deck');
  const [installStatus, setInstallStatusState] = useState<InstallStatus>({ phase: 'idle' });

  // Load initial status and subscribe to changes
  useEffect(() => {
    getInstallStatus().then(setInstallStatusState);
    const unsubscribe = onInstallStatusChange(setInstallStatusState);
    return unsubscribe;
  }, []);

  function handleRetry() {
    chrome.runtime.sendMessage({ type: 'RETRY_INSTALL' });
  }

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

      {/* Install progress banner (hidden when done) */}
      <InstallBanner status={installStatus} onRetry={handleRetry} />

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'deck' ? (
          <DeckView installing={installStatus.phase !== 'done'} />
        ) : (
          <SettingsPlaceholder />
        )}
      </main>
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
