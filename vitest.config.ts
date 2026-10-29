import { defineConfig } from 'vitest/config';

// Held-out evaluation is explicit and never part of the default test command.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['fixtures/heldout/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
    environmentMatchGlobs: [['tests/web/**', 'jsdom']],
    clearMocks: true,
    restoreMocks: true,
  },
});
