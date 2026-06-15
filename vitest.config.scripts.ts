import { defineConfig } from 'vitest/config';

// Dedicated project for the country-engine seed generator's pure-transform
// tests, which live under scripts/ rather than src/. Kept separate from the
// main two-project config (vitest.config.ts: node + dom over src/**) so neither
// the app test matrix nor the production build config is disturbed. Run with:
//   npx vitest run --config vitest.config.scripts.ts
// (npm run geo:test)
export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    // Pure, dependency-free TS that lives outside src/: the country-engine seed
    // generator and the provision-tenant edge-function guards (which have no Deno
    // globals in the pure module, so vitest imports them directly).
    include: ['scripts/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
});
