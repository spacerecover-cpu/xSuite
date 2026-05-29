import { defineConfig } from 'vitest/config';

// Unit tests run in a plain Node environment — the suites here cover pure logic
// (money math, status derivation) with no DOM or Supabase dependency. Kept
// separate from vite.config.ts so the production build config is untouched.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
