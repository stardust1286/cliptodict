export default defineBackground(() => {
  console.log('[ClipToDict] background service worker started');

  // Listen for extension install / update
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('[ClipToDict] First install — will trigger dictionary data download (Issue #2)');
    }
  });

  // Relay lookup messages from content scripts (Issue #6 will fill this in)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ type: 'PONG' });
    }
    // Returning true keeps the channel open for async responses
    return true;
  });
});
