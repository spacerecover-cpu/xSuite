/**
 * featureFlags — app-level build-time feature gates (distinct from the PDF-engine
 * routing flags in `src/lib/pdf/engine/featureFlag.ts`).
 *
 * DEFAULT-OFF by design: with the flag unset, the app behaves exactly as before.
 * Only the literal string `'true'` opts in — any other value (unset, `'false'`,
 * `'1'`, …) stays OFF. These are build-time, ALL-tenants switches.
 */

/**
 * Document Studio — the unified document & reporting redesign
 * (`docs/superpowers/specs/2026-06-27-document-studio-design.md`).
 *
 * Gates the new Document Studio admin surface and the case-side Documents
 * run-time while the migration lands incrementally. The legacy Report Studio
 * (`ReportSectionsPage`) and the current report flow remain the default until
 * this is flipped on per environment via `VITE_DOC_STUDIO=true`.
 */
export function isDocStudioEnabled(): boolean {
  const raw = (import.meta.env as Record<string, unknown>).VITE_DOC_STUDIO;
  return raw === 'true';
}
