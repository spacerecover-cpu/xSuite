# Per-Report-Type Template Cards — Design

**Date**: 2026-07-07 · **Status**: Approved (user: "proceed")

## Problem

Settings → Documents → Reports shows a single "Case report" card. The 8 report
types (evaluation, service, server, malware, forensic, data_destruction,
prevention, recovered_files) each have their own built-in section taxonomy and
sample data (2026-07-07 release), but they all share ONE tenant template row —
a tenant cannot style the Data Destruction certificate differently from the
Evaluation report. Requirement: all 8 report types must be available as
different templates inside the Reports category.

## Approach (chosen): subtype-scoped template rows

`report` stays the single engine `TemplateDocumentType`; each report type gets
its own `document_templates_pdf` row keyed `report:<subtype>` in the existing
free-text `document_type` column (per the M2 DDL, deliberately unconstrained —
no migration, no `database.types.ts` change). The whole
upsert/version/publish machinery is reused untouched; each type gets its own
version history and deployed state.

Rejected alternatives:
- **8 first-class doc types** — blast radius across the parity wall (~30 golden
  suites keyed per type), presets, adapters; all 8 reports share one adapter and
  differ only by sections/tones, which `reportConfigForSubtype` already models.
- **One card + in-Studio switcher writing into one config** — not "different
  templates": one version history, one reset wipes all 8.

## Components

1. **Storage keys** (`src/lib/pdf/templateConfig.ts`, pure):
   `TemplateStorageKey = TemplateDocumentType | 'report:<subtype>'`;
   `reportTemplateKey(subtype)` builds one, `parseTemplateStorageKey(key)`
   recovers `{ docType, reportSubtype? }`.

2. **Landing grid** (`documentTypeMeta.ts`): `DocumentTypeMeta` gains
   `key` (storage key) + `reportSubtype?`. The single report entry is replaced
   by 8 entries generated from `REPORT_TYPES` (names, descriptions, lucide
   icons already exist). A `LEGACY_REPORT_CARD` ("All reports — shared base",
   key `report`) is appended to the Reports category ONLY while the tenant's
   legacy shared row exists, so an existing customization stays editable.

3. **DocumentTemplatesPage**: card state (`editing`/`galleryFor`/
   `copyStyleFor`), the overview query, badges, and the save/reset/copy-style
   mutations re-key from `TemplateDocumentType` to storage keys. The overview
   additionally always loads the legacy `report` row to decide the legacy
   card's visibility.

4. **TemplateStudio**: new optional `reportSubtype` + `titleLabel` props. With
   a subtype the Studio is bound to it (built-in = `reportConfigForSubtype`,
   preview = that type's sample document, picker hidden). Without one (legacy
   shared card) the existing all-8 preview picker remains.

5. **Generation fallback** (`reportPDFService.buildReportDocViaEngine`):
   deployed `report:<subtype>` → deployed legacy `report` → built-in
   per-subtype config. Existing tenants keep their current output until they
   customize a specific type.

6. **CopyStyleModal**: takes the card list + keys instead of doc types, so
   styles copy between any cards (including report types).

## Error handling

Template resolution failures keep the existing behavior: log + fall back to the
built-in config (never block generation). Unknown storage keys parse as plain
doc types; unknown subtypes fall back to the evaluation taxonomy (existing
`reportConfigForSubtype` behavior).

## Testing

- `documentTypeMeta.test.ts`: grid still covers every engine type; 8 report
  cards mirror `REPORT_TYPES`; keys unique; parse/build round-trips.
- New `reportPDFService` test: resolution order (subtype key first, legacy
  fallback, no second lookup when the subtype row exists).
- Full suite + tsc must stay green (no engine/parity change expected).
