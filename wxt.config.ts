import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  extensionApi: 'chrome',
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: 'ClipToDict',
    description: 'Instant Japanese dictionary lookup via text selection or screen clip',
    version: '0.0.1',
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'tabs',
    ],
    host_permissions: [
      '<all_urls>',
    ],
    commands: {
      'screen-clip': {
        suggested_key: {
          default: 'Alt+Shift+S',
          mac: 'Alt+Shift+S',
        },
        description: 'Activate screen clip mode for OCR lookup',
      },
    },
  },
});
