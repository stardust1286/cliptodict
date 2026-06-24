/**
 * Install-progress tracking via chrome.storage.local.
 *
 * The background worker writes progress; the popup reads it to show a
 * progress indicator while the dictionary data is being downloaded.
 */

export type InstallPhase =
  | 'idle'
  | 'downloading-jmdict'
  | 'indexing-jmdict'
  | 'downloading-pitch'
  | 'indexing-pitch'
  | 'done'
  | 'error';

export interface InstallStatus {
  phase: InstallPhase;
  /** 0–100, present only during downloading phases */
  progress?: number;
  /** Human-readable error message, present only when phase === 'error' */
  error?: string;
}

const STORAGE_KEY = 'dictInstallStatus';

export async function getInstallStatus(): Promise<InstallStatus> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as InstallStatus) ?? { phase: 'idle' });
    });
  });
}

export async function setInstallStatus(status: InstallStatus): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: status }, resolve);
  });
}

/** Subscribe to install-status changes. Returns an unsubscribe function. */
export function onInstallStatusChange(
  callback: (status: InstallStatus) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && STORAGE_KEY in changes) {
      callback(changes[STORAGE_KEY].newValue as InstallStatus);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
