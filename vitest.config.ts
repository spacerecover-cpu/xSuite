import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Two projects:
// - node: pure logic (.test.ts) — money math, status derivation, cn, variants. No DOM.
// - dom:  components/hooks (.test.tsx) — jsdom + Testing Library.
// Kept separate so the production build config (vite.config.ts) is untouched.
//
// Pin the timezone so date-formatted output (e.g. the PDF golden snapshots) is
// deterministic regardless of the runner's local zone. The goldens were recorded
// in Gulf time (UTC+4); without this they pass locally in +4 but fail on CI's UTC
// runner. Asia/Dubai observes no DST, so +4 is stable year-round.
const TEST_TZ = 'Asia/Dubai';

// Stub the Supabase client env so tests run WITHOUT a local .env (CI runners,
// fresh clones, sandboxes). `src/lib/supabaseClient.ts` throws at import time
// when these are missing, which fails every test file whose import graph
// reaches it un-mocked. The values are inert — unit tests mock the query
// layer; nothing performs live I/O against this host.
const TEST_SUPABASE_ENV = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          },
        },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          env: { TZ: TEST_TZ, ...TEST_SUPABASE_ENV },
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          },
        },
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.tsx'],
          env: { TZ: TEST_TZ, ...TEST_SUPABASE_ENV },
        },
      },
    ],
  },
});
