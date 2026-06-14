import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          env: { TZ: TEST_TZ },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.tsx'],
          env: { TZ: TEST_TZ },
        },
      },
    ],
  },
});
