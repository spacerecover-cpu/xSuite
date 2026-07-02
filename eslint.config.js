 import js from '@eslint/js';
  import globals from 'globals';
  import reactHooks from 'eslint-plugin-react-hooks';
  import reactRefresh from 'eslint-plugin-react-refresh';
  import tseslint from 'typescript-eslint';
  import { BANNED_TABLES } from './eslint-rules/banned-tables.js';
  import noBannedEmbeds from './eslint-rules/no-banned-embeds-in-select.js';
  import noUntranslatedJsxText from './eslint-rules/no-untranslated-jsx-text.js';
  import noRawTailwindColors from './eslint-rules/no-raw-tailwind-colors.js';
  import noRawStyleColors from './eslint-rules/no-raw-style-colors.js';
  import noUnfilteredItemEmbed from './eslint-rules/no-unfiltered-item-embed.js';
  import noRawCurrencyAggregation from './eslint-rules/no-raw-currency-aggregation.js';
  import noHardcodedLocaleFormat from './eslint-rules/no-hardcoded-locale-format.js';
  import noGrayPalette from './eslint-rules/no-gray-palette.js';
  import noArbitraryTypography from './eslint-rules/no-arbitrary-typography.js';

  // Hoisted so the main config and the fixed-surface override below share one
  // identical xsuite plugin object (flat config resolves plugin rules per block).
  const xsuitePlugin = {
    rules: {
      'no-banned-embeds-in-select': noBannedEmbeds,
      'no-untranslated-jsx-text': noUntranslatedJsxText,
      'no-raw-tailwind-colors': noRawTailwindColors,
      'no-raw-style-colors': noRawStyleColors,
      'no-unfiltered-item-embed': noUnfilteredItemEmbed,
      'no-raw-currency-aggregation': noRawCurrencyAggregation,
      'no-hardcoded-locale-format': noHardcodedLocaleFormat,
      'no-gray-palette': noGrayPalette,
      'no-arbitrary-typography': noArbitraryTypography,
    },
  };

  export default tseslint.config(
    {
      // Global ignores. Lint scope is the React app in src/; everything else
      // uses different runtime conventions (Deno edge functions, build/CI
      // scripts, generated dist, agent worktrees).
      ignores: [
        'dist/**',
        'node_modules/**',
        '.claude/worktrees/**',
        '.claude/skills/**',
        'supabase/functions/**',
        'scripts/**',
        'eslint-rules/**',
        '*.config.js',
        '*.config.ts',
      ],
    },
    {
      extends: [js.configs.recommended, ...tseslint.configs.recommended],
      files: ['src/**/*.{ts,tsx}'],
      languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
      },
      plugins: {
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
        'xsuite': xsuitePlugin,
      },
      rules: {
        ...reactHooks.configs.recommended.rules,
        'react-refresh/only-export-components': [
          'warn',
          { allowConstantExport: true },
        ],
        'no-restricted-syntax': ['error', {
          selector: 'CallExpression[callee.property.name="from"][arguments.0.value=/^(' + BANNED_TABLES.join('|') + ')$/]',
          message: 'Legacy table name. Use catalog_*/master_*/geo_* prefix. See CLAUDE.md.',
        }],
        'no-restricted-imports': ['error', {
          paths: [
            { name: 'src/types/database', message: 'Use src/types/database.types instead.' },
            { name: '../types/database', message: 'Use ../types/database.types instead.' },
            { name: '../../types/database', message: 'Use ../../types/database.types instead.' },
          ],
        }],
        'xsuite/no-banned-embeds-in-select': 'error',
        'xsuite/no-unfiltered-item-embed': 'error',
        'xsuite/no-raw-tailwind-colors': 'error',
        // Non-blocking (warn): the lint gate runs `eslint .` with no
        // --max-warnings, so the ~1,684 pre-existing hardcoded strings warn
        // without failing CI, while NEW untranslated JSX text surfaces in review.
        'xsuite/no-untranslated-jsx-text': 'warn',
        // Enforced as error: raw inline-style hex colors bypass per-tenant
        // theming AND the class-based no-raw-tailwind-colors rule (how a banned
        // violet button bg slipped through). Test fixtures and the app-shell
        // neutral-chrome are baselined OFF per-file below (same pattern as
        // no-raw-tailwind-colors).
        'xsuite/no-raw-style-colors': 'error',
        // D7/D8: cross-document money sums must use the *_base shadow. Flipped to
        // 'error' after the 57-site burndown — every cross-document rollup now routes
        // through baseAmount/sumBankBalanceBase, and genuine single-currency rollups
        // carry a reasoned inline disable. New raw aggregations fail CI.
        'xsuite/no-raw-currency-aggregation': 'error',
        // Worldwide currency/locale guardrail (P4): hardcoded 'en-US'/'en-GB'
        // number/date formatting bypasses the tenant's Country-Engine locale.
        // 'warn' (not 'error') because ~15 pre-existing sites are being burned
        // down across other P4 slices — like no-untranslated-jsx-text, this
        // surfaces NEW violations in review without failing CI on existing debt.
        'xsuite/no-hardcoded-locale-format': 'warn',
        // Typography standard (DESIGN.md → Typography, 2026-07-02): the house
        // neutral is slate — gray-* was swept to zero and stays there (no
        // baseline)…
        'xsuite/no-gray-palette': 'error',
        // …and arbitrary text-[Npx]/tracking-[…] literals are banned (named
        // scale + text-xxs only; tracking-[0.5em] OTP exception is built into
        // the rule). Pre-existing offenders are baselined OFF per-file below
        // and ratchet down via the typography standardization program.
        'xsuite/no-arbitrary-typography': 'error',
        '@typescript-eslint/no-unused-vars': ['error', {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          // 'none' lets `catch (error) {}` blocks keep the error binding for
          // future logging without lint noise. This is conventional in the
          // codebase and the error is often re-thrown or surfaced via toast.
          caughtErrors: 'none',
        }],
        // Disabled: typescript-eslint v8 + eslint v9 mismatch crashes when
        // loading this rule (TypeError on allowShortCircuit option).
        '@typescript-eslint/no-unused-expressions': 'off',
        // Pre-existing tech debt — surfaced when the ESLint v9 upgrade made
        // the no-unused-expressions crash visible (it was hiding everything
        // after it). Downgraded to warning so the lint gate passes while
        // these are fixed incrementally in dedicated cleanup PRs.
        // The Phase 6 schema-discipline rules above (no-restricted-syntax,
        // no-restricted-imports, xsuite/no-banned-embeds-in-select) remain
        // strictly enforced.
        '@typescript-eslint/no-explicit-any': 'warn',
        'react-hooks/exhaustive-deps': 'warn',
        'react-hooks/rules-of-hooks': 'warn',
        'no-case-declarations': 'warn',
        'no-useless-escape': 'warn',
        'no-empty': 'warn',
        'no-constant-binary-expression': 'warn',
        'no-useless-catch': 'warn',
        'no-dupe-else-if': 'warn',
        'prefer-const': 'warn',
      },
    },
    {
      // Fixed surfaces intentionally NOT themed (see DESIGN.md): PDF document
      // builders and the pre-tenant auth decorative chrome.
      files: [
        'src/components/documents/**/*.{ts,tsx}',
        'src/components/auth/shared/AuthBackground.tsx',
        'src/components/auth/shared/constants.ts',
      ],
      plugins: { 'xsuite': xsuitePlugin },
      rules: {
        'xsuite/no-raw-tailwind-colors': 'off',
        'xsuite/no-raw-style-colors': 'off',
      },
    },
    {
      // no-raw-style-colors baseline (per-file OFF):
      //  - *.test.* — fixtures legitimately pass literal hex to components.
      // (The app-shell chrome — Sidebar/SidebarSection/AppLayout — was migrated
      //  to semantic tokens + neutral classes, so it is now enforced.)
      files: [
        'src/**/*.test.{ts,tsx}',
      ],
      plugins: { 'xsuite': xsuitePlugin },
      rules: { 'xsuite/no-raw-style-colors': 'off' },
    },
    {
      // i18n enforcement gate (A0/A3, Country Engine Phase 2): the portal is the
      // externally-visible non-English surface and is now fully extracted, so a
      // NEW untranslated literal there must FAIL CI (not just warn). The rest of
      // the app stays 'warn' until its slices are extracted (deferred breadth).
      files: [
        'src/pages/portal/**/*.{ts,tsx}',
        'src/components/portal/**/*.{ts,tsx}',
      ],
      plugins: { 'xsuite': xsuitePlugin },
      rules: { 'xsuite/no-untranslated-jsx-text': 'error' },
    }
  );