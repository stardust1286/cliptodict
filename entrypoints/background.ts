import { installDictionary } from '../src/lib/dict/install';
import { getInstallStatus, setInstallStatus } from '../src/lib/install-status';
import { lookup } from '../src/lib/lookup';

export default defineBackground(() => {
  console.log('[ClipToDict] background service worker started');

  // Dictionary install on first install
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('[ClipToDict] First install — starting dictionary data download');
      installDictionary().catch((err) => {
        console.error('[ClipToDict] installDictionary failed:', err);
      });
    }
  });

  // Also run install on service worker startup in case it was interrupted.
  // (Service workers can be killed mid-install; this resumes if stores are empty.)
  getInstallStatus().then((status) => {
    if (status.phase !== 'done') {
      console.log('[ClipToDict] Install not complete (phase:', status.phase, '), resuming...');
      installDictionary().catch((err) => {
        console.error('[ClipToDict] installDictionary resume failed:', err);
      });
    }
  });

  // Message relay
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ type: 'PONG' });
      return false;
    }

    if (message.type === 'GET_INSTALL_STATUS') {
      getInstallStatus().then((status) => sendResponse(status));
      return true;
    }

    if (message.type === 'RETRY_INSTALL') {
      setInstallStatus({ phase: 'idle' }).then(() => {
        installDictionary().catch((err) => {
          console.error('[ClipToDict] Retry install failed:', err);
        });
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === 'LOOKUP') {
      (async () => {
        try {
          const settings = await chrome.storage.local.get('apiKey') as { apiKey?: string };
          const result = await lookup(message.text as string, settings.apiKey);
          sendResponse(result);
        } catch (err) {
          sendResponse({ error: err instanceof Error ? err.message : 'Lookup failed' });
        }
      })();
      return true;
    }

    // Future message types will be handled here
    return true;
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'screen-clip') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_CLIP_MODE' });
        }
      });
    }
  });
});
