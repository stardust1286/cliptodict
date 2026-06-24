export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[ClipToDict] content script loaded');
    // Text selection lookup UI — implemented in Issue #7
  },
});
