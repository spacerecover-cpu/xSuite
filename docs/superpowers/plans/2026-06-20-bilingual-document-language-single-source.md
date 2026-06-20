# Bilingual Document Language — Single Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Template Studio "Document language" picker the authoritative source for each document type's language so bilingual (incl. side-by-side) renders reliably in both the live preview and the generated PDF, and the regression cannot silently return.

**Architecture:** Two competing "document language" stores exist today — the per-template `config.language` (Studio picker: `en`/`ar`/`bilingual_stacked`/`bilingual_sidebyside` + translation policy) and the tenant-wide `company_settings.localization.document_language_settings` (Localization Center: `english_only`/`bilingual` + secondary). The single bridge `applyTenantLanguage()` currently **overwrites** the template language with the tenant one (a hard clobber), discarding the picker. **Phase 1** flips that one function from *clobber* to *precedence* (template wins when it set a non-default language; tenant is the fallback) — a central change that repairs every render path. **Phase 2** collapses the two stores into one source of truth (seed templates from the tenant default at creation + a one-time backfill; demote the Localization toggle to "default for new templates").

**Tech Stack:** React 18 + TypeScript + Vite, Vitest, pdfmake engine (`src/lib/pdf/engine/*`), Supabase (Phase 2 backfill only).

---

## Root Cause (verified, 5-agent investigation + executable harnesses)

- `src/lib/pdf/engine/applyTenantLanguage.ts:74-82` returns `{ ...config, language: resolveTenantLanguageConfig(companySettings) }` — it **never reads `config.language`**, so the Studio picker is discarded on every render path.
- `resolveTenantLanguageConfig` can only ever emit `{mode:'en'}` or `{mode:'bilingual_stacked'}` — it **cannot express `bilingual_sidebyside` or `ar`**.
- For a tenant whose Localization is `english_only` (the default), every render — preview (`previewTemplate.ts:110`, `previewRecord.ts:149`) and deploy (8× `build*ViaEngine` in `pdfService.ts`) — collapses to English.
- Proven: rendering the same config **without** `applyTenantLanguage` yields 21 Arabic runs; **with** it, 0. The engine is correct; the bridge is the fault.
- `renderTemplate.ts:166-170` + `rtl.ts:75-83`: `config.language` alone drives direction, the "uses Arabic" flag, and the Arabic font (`Tajawal` for any non-`en` mode, independent of `ctx.fontFamily`). So fixing `config.language` is sufficient for Arabic to render.

---

## File Structure

**Phase 1 (the fix — shippable on its own):**
- Modify: `src/lib/pdf/engine/applyTenantLanguage.ts` — clobber → precedence (≈5 lines + docstring).
- Modify: `src/lib/pdf/engine/applyTenantLanguage.test.ts` — add precedence unit tests + a render-path regression guard.

**Phase 2 (durable collapse — sequenced follow-up, separate PR):**
- Modify: `src/lib/documentTemplateService.ts` — seed `config.language` from the tenant default when creating a new template version.
- New migration (via `mcp__supabase__apply_migration`): one-time backfill of `document_template_versions.config.language` from each tenant's `document_language_settings` where the template is still at the English default.
- Modify: `src/pages/settings/AccountingLocales.tsx` — relabel the language control as "default for new document templates" (UI copy).
- Modify (optional cleanup): the preview + deploy paths to derive the `TranslationContext` from the resolved `config.language` instead of independently from the tenant store.

---

## PHASE 1 — Precedence fix (template picker wins)

### Task 1: Make `applyTenantLanguage` honor an explicit template language

**Files:**
- Modify: `src/lib/pdf/engine/applyTenantLanguage.ts:74-82`
- Test: `src/lib/pdf/engine/applyTenantLanguage.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Add these inside the existing `describe('applyTenantLanguage', …)` block in `src/lib/pdf/engine/applyTenantLanguage.test.ts` (the `settings()` and `baseConfig()` helpers already exist in that file):

```ts
  it('keeps an explicit Studio language (bilingual side-by-side) even when the tenant Localization is english_only', () => {
    const cfg: DocumentTemplateConfig = {
      ...baseConfig(),
      language: { mode: 'bilingual_sidebyside', primary: 'en' },
    };
    const out = applyTenantLanguage(cfg, settings({
      mode: 'english_only',
      secondary_language: null,
      language_name: null,
    }));
    expect(out.language.mode).toBe('bilingual_sidebyside');
    expect(out.language.primary).toBe('en');
  });

  it('keeps an explicit Arabic-only Studio language regardless of tenant settings', () => {
    const cfg: DocumentTemplateConfig = {
      ...baseConfig(),
      language: { mode: 'ar', primary: 'ar' },
    };
    const out = applyTenantLanguage(cfg, settings(undefined));
    expect(out.language.mode).toBe('ar');
    expect(out.language.primary).toBe('ar');
  });

  it('falls back to the tenant Localization when the template is at the English default', () => {
    // baseConfig()'s language is the built-in { mode: 'en' } default, so the
    // tenant-wide setting still governs — preserving back-compat for tenants who
    // configure language in Settings, not the Studio picker.
    const out = applyTenantLanguage(baseConfig(), settings({
      mode: 'bilingual',
      secondary_language: 'ar',
      language_name: 'Arabic',
    }));
    expect(out.language.mode).toBe('bilingual_stacked');
    expect(out.language.primary).toBe('ar');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/pdf/engine/applyTenantLanguage.test.ts`
Expected: the two "keeps an explicit…" tests FAIL (current code returns `mode:'en'` because it clobbers); the "falls back…" test PASSES (already the behavior).

- [ ] **Step 3: Implement the precedence rule**

Replace the body of `applyTenantLanguage` (currently lines 74-82) in `src/lib/pdf/engine/applyTenantLanguage.ts` with:

```ts
export function applyTenantLanguage(
  config: DocumentTemplateConfig,
  companySettings: CompanySettingsData,
): DocumentTemplateConfig {
  // PRECEDENCE: the per-template language (Settings → Documents Studio "Document
  // language" picker) is authoritative once it selects a non-default — i.e.
  // non-English-only — document language. Only when the template is still at the
  // built-in English default (`mode: 'en'`) do we fall back to the tenant-wide
  // Settings → Localization default. This stops the picker (which can express
  // side-by-side and Arabic-lead, neither expressible by the tenant setting) from
  // being clobbered, while preserving the legacy tenant-wide behavior for
  // templates that never chose a language in the Studio. Pure: when the template
  // wins we return it unchanged; otherwise a fresh config with a fresh `language`.
  if (config.language && config.language.mode !== 'en') {
    return config;
  }
  return {
    ...config,
    language: resolveTenantLanguageConfig(companySettings),
  };
}
```

Also update the file-level docstring (lines 28-32) note "Called inside EVERY `build*ViaEngine`…" to add: "Honors an explicit template language; only English-default templates inherit the tenant setting."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/pdf/engine/applyTenantLanguage.test.ts`
Expected: PASS (all, including the pre-existing non-mutating and build-path tests — the non-mutating test uses an English-default template + bilingual tenant, which still hits the fallback branch and returns a fresh object).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/applyTenantLanguage.ts src/lib/pdf/engine/applyTenantLanguage.test.ts
git commit -m "fix(pdf): template language picker wins over tenant default (stop clobber)"
```

### Task 2: Render-path regression guard (the test that stops "Again")

**Files:**
- Test: `src/lib/pdf/engine/applyTenantLanguage.test.ts` (extend the existing `describe('applyTenantLanguage → renderTemplate (build path)', …)` block)

- [ ] **Step 1: Add a `collectText` helper at the top of the test file** (after the imports), matching the pattern used in `sections/terms.test.ts`:

```ts
function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  Object.values(o).forEach((v) => collectText(v, out));
}
```

- [ ] **Step 2: Write the failing regression test** inside the build-path `describe`:

```ts
  it('regression: an explicit bilingual_sidebyside picker survives an english_only tenant and renders Arabic (was clobbered to English)', () => {
    const cfg: DocumentTemplateConfig = {
      ...baseConfig(),
      language: { mode: 'bilingual_sidebyside', primary: 'en' },
    };
    const applied = applyTenantLanguage(cfg, settings({
      mode: 'english_only',
      secondary_language: null,
      language_name: null,
    }));
    expect(applied.language.mode).toBe('bilingual_sidebyside');

    const doc = renderTemplate(applied, minimalData(), ctx);
    // The Arabic-capable font is selected for any non-'en' mode (rtl.ts), and
    // Arabic system-label text is present — neither happens if the tenant
    // override collapses the document back to English.
    expect((doc.defaultStyle as { font?: string }).font).toBe('Tajawal');
    const texts: string[] = [];
    collectText(doc, texts);
    expect(texts.some((t) => /[؀-ۿ]/.test(t))).toBe(true);
  });
```

- [ ] **Step 3: Run it to verify it passes** (Task 1 already fixed the code)

Run: `npx vitest run src/lib/pdf/engine/applyTenantLanguage.test.ts`
Expected: PASS.

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit && npx vitest run src/lib/pdf && npx eslint --quiet src/lib/pdf/engine/applyTenantLanguage.ts src/lib/pdf/engine/applyTenantLanguage.test.ts`
Expected: tsc 0 errors; PDF suite green; 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/applyTenantLanguage.test.ts
git commit -m "test(pdf): regression guard — bilingual picker renders for english_only tenant"
```

### Task 3: Open the Phase 1 PR

- [ ] Push the branch and open a **draft** PR describing: the clobber root cause, the precedence fix, that it repairs preview + all deploy doc-types via the single bridge, backward-compatibility (English-default templates still inherit the tenant setting), and the regression guard. Note CI remains disabled per standing instruction.

---

## PHASE 2 — Collapse to one source of truth (sequenced follow-up, separate PR)

> Execute **after** Phase 1 lands and is validated. The backfill step requires reading current production data, so its exact SQL is finalized at execution time (introspect first — do not guess).

**Design (the durable end-state):** the per-template `config.language` is the ONLY authority consumed at render time. The tenant `document_language_settings` becomes a *seed/default*, not a runtime override.

- **2a — Seed new templates.** In `src/lib/documentTemplateService.ts` `createVersion(...)`, when a new template version is created without an explicit `config.language`, seed it from `resolveTenantLanguageConfig(companySettings)` so every persisted template carries an explicit language from birth. TDD: a created version for a bilingual-Arabic tenant has `config.language.mode === 'bilingual_stacked'`.
- **2b — One-time backfill (Supabase migration).** Introspect first: `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`) to list `document_template_versions` whose `config->'language'->>'mode'` is `'en'`/null for tenants whose `company_settings.localization.document_language_settings.mode = 'bilingual'`. Then `mcp__supabase__apply_migration` with an **additive, scoped** `UPDATE` that sets `config = jsonb_set(config,'{language}', …)` ONLY for those rows (never touches templates that already chose a language). Record in the migration manifest per repo discipline. No `DROP`/`DELETE`.
- **2c — Demote the Localization toggle (UI).** In `src/pages/settings/AccountingLocales.tsx`, relabel the document-language control to "Default document language (applied to new templates; per-document language is set in Settings → Documents)" and link to the Studio. Load `ui-ux-pro-max` + `frontend-design` before editing (per CLAUDE.md skill gate).
- **2d — Align the translation context (optional hardening).** Make `previewTemplate.ts`/`previewRecord.ts` and the `pdfService.ts` deploy paths build the `TranslationContext` from the *resolved* `config.language` (a shared `buildContextForLanguage(language, companySettings)` helper) rather than independently from the tenant store, so any legacy `ctx.t` field-label translation follows the picker too. (Not required for the symptom — `config.language` already drives all visible engine output — but removes the last split.)
- **2e — Retire the runtime fallback (only once 2a+2b guarantee every config has an explicit language).** Simplify `applyTenantLanguage` to a pure pass-through (or delete it from the render paths), leaving `config.language` as the sole authority. Keep a deprecation shim + tests so nothing else that imports it breaks.

**Phase 2 acceptance:** with the Localization toggle set to english_only, a template whose Studio picker is "Bilingual — side by side" still renders bilingual side-by-side in both preview and the generated quote/invoice; a brand-new tenant with a bilingual Localization default gets bilingual templates without opening the Studio.

---

## Self-Review

- **Spec coverage:** Phase 1 (precedence) directly fixes the reported symptom on every surface (single bridge). Phase 2 (2a–2e) delivers the chosen "unify to one source of truth": seed (2a/2b), demote the second store (2c), align ctx (2d), retire the override (2e).
- **Type consistency:** `LanguageConfig` = `{ mode: LanguageMode; primary: 'en'|'ar' }` (`templateConfig.ts:28-34`); `LanguageMode` includes `bilingual_sidebyside`; `resolveTenantLanguageConfig` / `applyTenantLanguage` signatures unchanged. Test helpers (`settings`, `baseConfig`, `minimalData`, `ctx`) reused from the existing test file; `collectText` mirrors `sections/terms.test.ts`.
- **No placeholders:** Phase 1 steps contain complete code + exact commands. Phase 2's backfill SQL is intentionally finalized against live data at execution time (a correctness requirement for a data migration, not a deferred detail) — every other Phase 2 step names the exact file and change.
