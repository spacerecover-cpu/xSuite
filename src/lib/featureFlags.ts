/**
 * featureFlags — app-level build-time feature gates (distinct from the PDF-engine
 * routing flags in `src/lib/pdf/engine/featureFlag.ts`).
 *
 * DEFAULT-ON (opt-out) since Phase 11: with the flag unset, the app uses the new
 * Document Studio flow. Set `VITE_DOC_STUDIO=false` as an emergency kill switch to
 * HIDE the entire Reports/Documents surface. Only the literal string `'false'`
 * disables it — any other value (unset, `'true'`, `'1'`, …) keeps it ON. These are
 * build-time, ALL-tenants switches.
 *
 * NOTE: there is NO legacy fallback. The legacy Report Studio surface was retired in
 * Phase 11 and its write paths deleted. Setting `VITE_DOC_STUDIO=false` does NOT
 * restore anything — it simply hides the new Reports surface entirely (emergency
 * off-switch only). If you see a blank/missing Reports tab, check this flag first.
 */

/**
 * Document Studio — the unified document & reporting redesign
 * (`docs/superpowers/specs/2026-06-27-document-studio-design.md`).
 *
 * Gates the entire case-side Reports/Documents surface (tab + content + modals).
 * Set `VITE_DOC_STUDIO=false` as an emergency kill switch to hide the surface.
 * There is NO legacy fallback — the old report stack was deleted in Phase 11.
 */
export function isDocStudioEnabled(): boolean {
  const raw = (import.meta.env as Record<string, unknown>).VITE_DOC_STUDIO;
  return raw !== 'false';
}
