# Tenant-Configurable Bilingual PDF Document Template Engine — Design Spec

> **Status:** Approved to start implementation (2026-06-13). M0 (design) in progress.
> **Hard gate:** No migration / RLS / Storage / payment change is applied without explicit per-step approval.
> **Supabase project:** `ssmbegiyjivrcwgcqutu`.
> Related (distinct): `docs/superpowers/specs/2026-06-07-payment-workflow-financial-documents-design.md` (payment workflow, not the template engine).

## 1. Goal

Let each tenant design and control every generated document — from the smallest
office check-in receipt to full financial statements — including bilingual
(Arabic/English, RTL-aware) layouts and logo upload, while preserving xSuite's
forensic auditability, multi-tenant isolation, and the data-recovery lifecycle.

## 2. Verified current state (Phase 1)

Established by read-only codebase + live-schema analysis and 5 adversarial verifications.

- **Renderer:** `pdfmake` v0.2.20 is the **sole** PDF library, **client-side only**
  (`src/lib/pdf/pdfService.ts`, `fonts.ts`). No HTML→PDF / Puppeteer / react-pdf /
  server/edge rendering. PDFs are transient blobs (download/open/email-base64);
  never stored. Logged to `pdf_generation_logs` (file_url/file_size unused).
- **11 imperative builders** in `src/lib/pdf/documents/` (Office Receipt, Customer
  Copy, Checkout Form, Case Label, Stock Label, Chain of Custody, Quote, Invoice,
  Payment Receipt, Payslip, Report). 400–700 lines each; **layout/sections/labels
  hardcoded** — none are template/config-driven. `DocumentType` union = 9; Report
  (separate `reportPDFService.ts`) + Stock Label sit outside it.
- **Data flow:** services → `dataFetcher.ts` typed mappers (`satisfies`, no casts) →
  builders. Identity/branding from a single `company_settings` row
  (`types.ts:63-119`). Currency from `accounting_locales` (`is_default=true`).
  `TenantConfigContext` is **not** used in the PDF module.
- **Branding/logo flow EXISTS:** `fileStorageService.uploadLogo()` → `company-assets`
  Storage bucket; `GeneralSettings.tsx` UI for Primary/Light/Favicon; URL stored in
  `company_settings.branding.logo_url`; builders base64-embed it (fallback to centred
  company name). Per-doc-type QR URLs+captions already in `branding`.
  `branding.primary_color` is **collected but ignored** (PDFs deliberately non-themed).
- **Styling (`styles.ts`):** fixed `PDF_COLORS` (primary Royal navy `#162660`),
  `DEFAULT_FONT='Roboto'`, shared `PDF_STYLES` + `getStylesWithFont()`. Dual-language
  helpers **already exist** (`createBilingualInfoBox`, `createBilingualSectionHeader`,
  `createTermsBox` side-by-side EN/AR, `createBilingualSignatureBlock`). ~500 lines of
  header/footer/identity logic copy-pasted across 7–10 builders (biggest blocker).
- **Localization/RTL:** `fontLoader.ts` loads Noto Sans Arabic + Tajawal (+KR/TH/JA/ZH)
  local→CDN. `translationContext.ts` → `{t, isRTL, isBilingual, languageCode, fontFamily}`.
  `documentTranslations.ts` = **fixed (non-tenant-editable) dictionary**. **Reality:**
  bilingual = inline `"English | Arabic"` (`formatBilingualText`), the side-by-side
  helpers are bypassed because **8/10 builders pass `null` for the Arabic title**;
  `formatBilingualText` **ignores its `isRTL` arg**; no builder applies RTL/bidi.
  Language mode is **global**, not per-document. **pdfmake has no native bidi.**
- **Dormant tables:** `document_templates` / `templates` / `template_versions` are
  **empty (0 rows)** and serve **email/SMS/WhatsApp text templates only** — NOT PDFs.
  Do **not** reuse them for the PDF engine.
- **Report Studio** (`report_section_library/_presets`, `master_case_report_templates`,
  `case_report_sections`) is **case-report-only** (8 report types). Invoices/quotes have
  zero template integration and no `template_id` columns. **RLS gaps:**
  `report_section_library`, `report_section_presets`, `master_case_report_templates`
  use `SELECT USING(true)` (no tenant isolation despite `tenant_id`); soft-delete is
  inconsistent (`deleted_at` vs `is_active` vs hard delete). Must be fixed before extending.

**Net:** branding ~70% built; per-document configurability 0%; ~60% of the asked-for
accounting document family does not exist as PDFs yet.

## 3. Benchmark takeaways (Phase 2)

Consensus across Zoho · NetSuite · SAP · Xero · QuickBooks · Shopify · Stripe/Carbone/
Invoice Ninja/pdfme:

- **Field-toggle + cascade** beats free WYSIWYG for safety (Stripe's bounded fields).
- **Branding as a first-class reusable theme** (Xero "branding theme", one ID).
- **Override cascade** global → doc-type → per-instance, applied to *every* doc type
  (Xero's statement fallback bug is the cautionary tale).
- **Immutable versions + deployed pointer + lock-on-finalize** (Carbone v5 / Stripe):
  issued forensic docs pin their version → can't be retroactively altered.
- **Live preview against a real chosen record**, non-destructive (Invoice Ninja).
- **One template + locale dictionary + `lang` param** (Carbone) — never fork per language.
- **Locale formatting stays in a config layer**, not the template (validates our
  `accounting_locales`/`TenantConfig` split).
- **Native QR/barcode** bound to the record (GCC ZATCA invoice QR).
- **RTL/bilingual is the differentiation opening:** every product is weak; none ship a
  true side-by-side/stacked EN/AR document with Arabic amount-in-words. GCC (UAE FTA /
  KSA ZATCA) mandates Arabic — a compliance moat. pdfmake RTL via `@digicole/pdfmake-rtl`
  fork (auto column-reversal) or our own bidi/shaping pass over the embedded fonts.

## 4. Decisions

1. **Keep pdfmake** (sole, audited, client-side; preview = real artifact). The engine is a
   config-driven assembler over pdfmake, orthogonal to the renderer. HTML→Chromium remains a
   **named fallback** only if RTL fidelity proves intractable at the bilingual milestone.
2. **New first-class schema** — do not reuse the empty email `document_templates` tables.
   Extend the existing branding flow + Report Studio sectioning concepts.
3. **Field-toggle + cascade in v1**; defer WYSIWYG/code-override.
4. **Defaults (overridable at M1 gate):** follow `DESIGN.md` (Royal navy, DM Serif Display +
   DM Sans, industrial — NOT the prompt's #0f172a/teal/glassmorphism/Syne); PDFs stay
   **neutral (logo-only)**, per-tenant accent deferred and opt-in; **v1 scope = make existing
   docs configurable + engine + bilingual**; net-new accounting family = Phase 2.

## 5. Target architecture

**Renderer:** keep pdfmake. Replace the 11 imperative builders with one assembler
`renderTemplate(resolvedConfig, data, ctx) → TDocumentDefinitions`, composed of shared
section renderers (header, party block, line-item table, totals, terms, signatures,
footer, QR, custody log, section list).

**New schema** (tenant-scoped, RESTRICTIVE RLS, soft-delete, audited; names TBD at M1):
- `branding_themes` — Xero-style reusable identity (logo refs reusing `company-assets`,
  opt-in accent, font, default paper/margins, footer/terms text, socials, QR config,
  language defaults). Seeded from `company_settings.branding`.
- `document_templates_pdf` — per doc-type: `document_type`, `branding_theme_id`,
  `config jsonb`, `is_default`, `language_mode`.
- `document_template_versions` — **immutable** (`version_id`, `config` snapshot,
  `is_deployed` pointer). Edit → new version; Publish flips pointer; Rollback re-points.
- Issued rows (`invoices`/`quotes`/`case_reports`/custody exports) gain nullable
  `template_version_id` → **pins** the version at issue (lock-on-finalize).
- **Also fix** the Report Studio RLS gaps (replace `USING(true)` with RESTRICTIVE tenant
  isolation; normalise soft-delete).

**Template config schema (JSON):**
```jsonc
{
  "paper":    { "size": "A4|Letter", "orientation": "portrait|landscape", "margins": [t,r,b,l] },
  "branding": { "themeId": "uuid", "logo": true, "accent": "inherit|#hex", "watermark": null },
  "language": { "mode": "en|ar|bilingual_stacked|bilingual_sidebyside", "primary": "en|ar" },
  "sections": [
    { "key": "header", "visible": true, "order": 0 },
    { "key": "lineItems", "visible": true, "order": 3,
      "columns": [ { "key": "description", "visible": true,
                     "label": {"en":"Description","ar":"الوصف"}, "width": 220 } ] },
    { "key": "totals", "visible": true, "order": 4,
      "lines": { "subtotal": true, "vat": true, "amountInWords": true } },
    { "key": "terms", "visible": true }, { "key": "signature", "visible": false },
    { "key": "qr", "visible": true }
  ],
  "labels": { "documentTitle": {"en":"TAX INVOICE","ar":"فاتورة ضريبية"} }
}
```

**Cascade (most-specific-wins):** built-in default → tenant branding theme → doc-type
template (deployed version) → per-instance override → lock+pin on issue. One resolver,
applied to all doc types.

**Bilingual/RTL:** per-doc `language.mode`; labels from a tenant-extendable dictionary
(Carbone-style, missing key printed visibly); **fix the `null`-Arabic-title bug** to light
up the existing side-by-side helpers; add a bidi/shaping pass (or the RTL fork) so
`bilingual_sidebyside`/`ar` mirror columns + right-align; add Arabic amount-in-words for
GCC invoices. Fonts already embedded.

## 6. Settings UI/UX — Settings → Documents

New area beside the 19 existing Settings pages (home next to `AppearanceSettings`/
`ReportSectionsPage`). Honors `DESIGN.md` tokens (no new tokens, no glassmorphism, no
purple/indigo/violet, no raw hex).

- **Template list** per doc type (gallery cards, Default badge, Duplicate / Reset-to-default).
- **Editor** = split pane: left = tabbed field-toggle form (Branding · Sections & Fields ·
  Labels & Language · Page Setup · Terms/Signatures/QR); right = **live pdfmake preview
  against a real chosen record** (non-destructive). Toggle+rename-in-row; column
  reorder/width; per-line totals toggles.
- **Language settings:** mode per doc type + tenant label-dictionary editor (source/target
  side-by-side).
- **Logo/branding:** reuse `GeneralSettings` upload; theme-level overrides.
- **Versioning:** save → version; Publish/Rollback; "issued docs pinned" indicator.

## 7. Document coverage

**Exists → make config-driven (pilot = Invoice):** Tax/Proforma Invoice ⭐, Quote/Estimate,
Payment Receipt, Office Receipt, Customer Copy, Checkout/Return Form, Case Label, Stock
Label, Chain of Custody, Case Report (7–8 types), Payslip.

**Net-new (Phase 2 — net build, several touch payments → own approvals):** Refund receipt,
Recurring invoice, Credit/Debit note, Sales order, Purchase order, Delivery/packing slip,
Customer/Vendor statement, Vouchers (payment/receipt/contra/journal), Journal entries,
General ledger / sub-ledgers / trial balance, Balance sheet / P&L / Cash flow, VAT/Tax
return, Aging report, plus lab-legal: NDA, Certificate of Destruction, Recoverability
assessment, Data-delivery/file manifest + customer-acceptance gate, Destructive-attempt
consent.

## 8. Phased plan (⚠ = its own approval gate)

- **M0** — Spec + plan + exact M1 migration draft + config schema + call-site map. No DB writes.
- **M1 ⚠** — Migration + RESTRICTIVE RLS + Storage; new tables; fix Report Studio RLS gaps. *Approval.*
- **M2** — Engine core: config→pdfmake assembler + shared section renderers + cascade
  resolver + version pinning. Extract duplicated header/footer first (pure refactor).
- **M3** — Pilot end-to-end: Invoice fully template-driven + Settings editor + live preview.
- **M4** — Settings UI rollout (gallery, editor tabs, label dictionary, versioning).
- **M5** — Roll out remaining existing docs onto the engine.
- **M6 ⚠** — Bilingual/RTL (fix `null` bug, real bidi/RTL, dictionary, Arabic amount-in-words).
  *Decision point:* if RTL intractable in pdfmake, evaluate HTML path.
- **M7** — Branding/theme polish (accent opt-in, multi-logo/branch).
- **M8 ⚠** — Net-new accounting/financial + lab-legal documents (several touch payments).
- **M9** — QA: golden-PDF snapshots, RTL/long-Arabic/12-drive-RAID fixtures, characterization tests.

## 9. Risks & open questions

**Risks:** builder replacement → visual regressions (snapshot/characterization tests first);
pdfmake bidi is hard (M6 risk → HTML off-ramp); per-tenant document color reopens the
deliberate non-themed decision; existing Report Studio RLS gaps must be fixed before
extending; issued PDFs are not stored (consider storing issued forensic docs); Arabic font
subset/licensing + PDF size.

**Open questions (defaulted; confirm at M1 gate):**
1. Follow `DESIGN.md` and ignore the prompt's #0f172a/teal/glassmorphism/Syne? (default: yes)
2. PDFs stay neutral (logo-only) or allow a bounded opt-in accent? (default: neutral)
3. Field-toggle + cascade for v1, defer WYSIWYG/override? (default: yes)
4. v1 = existing docs only, or include the net-new accounting family? (default: existing first)
5. Should issued forensic/financial PDFs be stored for audit? (default: defer to M8)
6. Table naming/prefix for the new schema. (default: propose at M1)
