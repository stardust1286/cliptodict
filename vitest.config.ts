import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude stale agent worktree copies and build output — they contain
    // duplicate *.test.ts files with broken tsconfig `extends` paths that
    // otherwise pollute the test run with TSConfckParseError noise.
    exclude: [
      '**/node_modules/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/.claude/**',
    ],
  },
});
