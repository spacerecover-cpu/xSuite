# xSuite Modal & Overlay Audit — 2026-07-02

> **Audit only.** No code was modified. This report inventories every modal, dialog, popup, drawer,
> wizard, and overlay in the application; compares them against each other and the platform standard
> (DESIGN.md → Overlays + the `ui/` primitives); and delivers the analyses requested: zero-scroll
> feasibility, the X-close-button census (for its planned removal), and one-system conformance.
>
> **Method.** (1) Mechanical census of every overlay root (`<Modal`, direct `<Dialog` composition,
> `<ConfirmDialog>`, `useConfirm()` call sites, hand-rolled `fixed inset-0`); (2) line-level read of the
> five overlay primitives; (3) five parallel domain sweeps reading every consumer file; (4) synthesis
> with cross-domain comparison. User-supplied screenshots (case wizard + stacked Add Customer, Add
> Customer from the list page, Add Company, settings "Add New Supplier Categories", User Management)
> are mapped in §10.

---

## 1. Executive Summary

**Total overlay population: ~124 distinct modal/overlay instances** across 5 domains (cases ~25,
financial/HR 23, CRM 30, settings/inventory/stock 22, platform-admin/portal/shared 24), **plus 31
files invoking the shared `useConfirm()` surface** and the 7 overlay primitives themselves.

The architecture is in far better shape than typical: **~95% of overlays route through the two
canonical primitives** (`ui/Modal` → `ui/Dialog`), the scrim/focus-trap/scroll-lock/Escape-stack
mechanics are centralized and correct, and the few hand-rolled surfaces are menus/drawers rather than
rogue modals. The inconsistency lives one level up, in **what consumers build inside the primitives**:

1. **Three parallel confirmation systems** (finding M-1): the shared `ConfirmDialog`/`useConfirm`
   (31+11 consumers) coexists with **~15 bespoke Modal-built confirms** (8 in cases, 4 in quotes,
   leave/timesheet/expense approve-reject, portal approve/reject) — each with its own layout, icon
   treatment, and button styling.
2. **Duplicate entity forms** (M-2): "Add New Customer" exists as **two different UIs** — the
   sectioned `CustomerFormModal` (opened from the case wizard; screenshot 1) and a flat inline modal
   hand-built in `CustomersListPage` (screenshot 2). "Add New Company" exists **three times**
   (CustomerFormModal sub-modal, CustomersListPage inline, CompaniesListPage inline pair).
3. **The footer is the systemic gap** (M-3): `Modal` has **no footer slot**, so 100% of footers are
   consumer-rendered — most in-body (`pt-2/3/4/6 border-t`, scrolling away on long forms: Invoice,
   Quote, Email, Signature, DraftReview), some hand-pinned (DeviceFormModal, CommandPalette,
   CasePeekPanel), some absent entirely (View modals). Cancel is `ghost` in half the app and
   `secondary` in the other half.
4. **Zero-scroll** (§6): ≈70 modals already fit; **≈30 more would fit** by adopting the DESIGN.md
   Workspace 4-column grid / a wider size tier / collapsible sections; ~15 genuinely need
   tabs/steps/pinned-footer treatment (Invoice ~2,000px, Quote ~1,800px, PurchaseOrder ~1,600px,
   Supplier ~1,200px bodies); ~9 are sanctioned tall media/split layouts.
5. **The X close button** (§7) is centralized: `Modal` renders it by default for ~110 instances, one
   consumer suppresses it, seven surfaces hand-roll their own X (in **three different visual specs**),
   and DESIGN.md references it in exactly two lines. Removal is mechanically one primitive flip — the
   real work is the **~10 View-type modals whose only dismissal affordance is the X** (they need a
   footer Close/Done first) and an explicit decision on the media lightbox.
6. **Post-P2b regression inside the platform's own primitive** (M-6): `ConfirmDialog`'s confirm action
   is a raw `<button>` (16px text, `rounded-lg`, `py-2`) sitting beside a ghost `ui/Button` Cancel that
   is now 14px — the two buttons in the app's most-reused dialog no longer match.

---

## 2. Primitive Baseline (what "standard" means)

| Primitive | Verified spec |
|---|---|
| `ui/Dialog` (`Dialog.tsx`) | Portal to body; overlay `fixed inset-0 z-modal` centered; backdrop `bg-slate-900/40`; panel `mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface shadow-xl` (**whole-panel scroll unless the consumer passes `flex flex-col overflow-hidden`**); focus trap + restore; **ref-counted** body scroll-lock; Escape closes topmost only; dev-time accessible-name guard. |
| `ui/Modal` (`Modal.tsx`) | Wraps Dialog with `flex flex-col overflow-hidden`. Sizes: xs→`max-w-sm`, sm→`md`, **md (default)→`lg`**, lg→`2xl`, xl/large→`4xl`, 2xl→`6xl`; `maxWidth` 3xl–7xl override wins. Header `p-3 border-b` + title `text-lg font-semibold` + optional icon (w-5 `text-primary`) + `headerBadges`/`headerAction`. **X close button default ON** (`p-1.5 rounded-lg`, `X w-5`); title-less variant renders an absolute X `top-3 end-3`. Body `p-4 overflow-y-auto flex-1`. **No footer slot.** |
| `ui/ConfirmDialog` | Dialog `max-w-md p-6`; **own X** (`top-4 end-4 p-1`, `X w-5 text-slate-400`, `rounded` not `rounded-lg`); tinted icon circle (`Trash2`/`AlertTriangle` per variant); title `text-lg font-semibold … pe-10`; message `text-sm text-slate-600`; footer = ghost `Button` Cancel + **raw `<button>` confirm** (`px-4 py-2 rounded-lg font-medium`, unsized → 16px). |
| `hooks/useConfirm` | `ConfirmProvider` renders the shared `ConfirmDialog`; async confirm with loading state that blocks cancel/close; errors surfaced via toast. 31 consumer files. |
| `ui/PhotoViewerModal` | Dialog with `bg-black/90 backdrop-blur-sm`; **own X** (`top-3 end-3 p-3`, `bg-white/10 hover:bg-white/20`); no header/footer; image `maxHeight: 90vh`. |
| `layout/MobileNavDrawer` | Hand-built slide-over (sanctioned): panel `w-72 max-w-[85vw]`, `inert`+translate off-canvas, **own X** (`top-3 end-3`, `bg-slate-200` chip). |
| Menu/popover surfaces | `RowActionsMenu` (portal-positioned, `z-modal`, outside-click close, no X), `ColumnPickerPopover` (`fixed inset-0 z-overlay` catcher + absolute panel), `CaseViewsMenu`, legacy inline row menus — **not modals**; correct per the DESIGN.md z-index scale. |

**DESIGN.md size-tier vocabulary note:** `size="xl"` and `size="large"` are aliases (both `max-w-4xl`),
and the size names do not match Tailwind's (`size="2xl"` → `max-w-6xl`). This aliasing confused one
domain sweep in real time — it is itself a small consistency finding (M-11).

---

## 3. Inventory by Domain (counts; full per-modal tables retained in the sweep outputs)

| Domain | Instances | Form | Confirm/Decision | View/Detail | Wizard/Workflow | Picker/Media/Palette | Drawer/Menu |
|---|---|---|---|---|---|---|---|
| Cases | ~25 | 8 | 8 | 3 | 2 (+CreateCaseWizard) | 2 | 2 |
| Financial / Banking / Payroll / HR | 23 | 14 | 3 | 5 | — | 1 | — |
| CRM (customers/companies/quotes/kb/comms/suppliers) | 30 | 17 | 6 | 3 | — | 2 | 2 sub-modals |
| Settings / Templates / Inventory / Stock / DataMigration | 22 | 13 | 2 | 2 | 3 (Import/Export/ItemWizard) | 2 | — |
| Platform-admin / Admin / Users / Portal / Shared / Auth | 24 | 12 | 2 | 2 | 1 (MFA) | 4 | 3 |
| **Total** | **~124** | **64** | **21 (+31 useConfirm files +11 ConfirmDialog)** | **15** | **6** | **11** | **7** |

Representative members per type:
- **Form:** ExpenseFormModal, RecordPaymentModal, AccountFormModal, CustomerFormModal,
  SupplierFormModal, PurchaseOrderFormModal, UserFormModal, JobFormModal, LoanFormModal,
  InvoiceFormModal, QuoteFormModal, ArticleEditorModal, LineItemTemplateFormModal, CategoryDetail
  master-data CRUD, StockItemFormModal, ResourceCloneDriveModal…
- **Confirmation/Decision:** shared ConfirmDialog/useConfirm; bespoke: DeleteCase, DuplicateCase,
  Archive/ExtractClone, MarkAsDelivered, PreserveLongTerm, SpaceInsufficient, CaseSuccess, quote
  delete/status/restore/purge, leave & timesheet approve/reject, portal approve/reject,
  DeleteInventoryConfirmation.
- **View:** ExpenseDetailModal, PaymentViewModal, LoanDetailModal, ReportsDashboard report modal,
  DeviceDetailsModal, InventoryDetailModal (composite + 3 child modals), PortalCases/PortalQuotes
  detail.
- **Wizard:** CreateCaseWizard, ImportWizard (4-step), ExportWizard (3-step), MFAEnrollment,
  InventoryItemWizard (single-view multi-section).
- **Picker/Media/Palette:** TemplateGalleryModal, CommandPalette, PhotoViewerModal,
  PaymentReceiptModal (PDF), EmailDocumentModal nested PDF preview, catalog pickers nested in
  Invoice/Quote forms, SignatureCaptureModal.
- **Drawer/Menu:** CasePeekPanel, MobileNavDrawer, CaseViewsMenu, RowActionsMenu,
  ColumnPickerPopover, notification/stock-alert dropdowns.

---

## 4. Cross-Cutting Inconsistency Catalog

**M-1 · Three confirmation systems.** Shared `ConfirmDialog` (+`useConfirm`, 42 consumer files) vs
~15 bespoke Modal-built confirms vs 2 portal inline-styled confirms. The bespoke ones each restyle:
different icon treatments (tinted circle vs plain icon vs alert box), different body structures
(type-to-confirm input, retention grids, capacity graphs), different button variants. Cases alone has
8 (`DeleteCase`, `DuplicateCase`, `ArchiveClone`, `ExtractClone`, `MarkAsDelivered`,
`PreserveLongTerm`, `SpaceInsufficient`, `CaseSuccess`).

**M-2 · Duplicate entity-form modals.** Add/Edit Customer: `components/customers/CustomerFormModal`
(sectioned: CONTACT DETAILS / ORGANIZATION / LOCATION / collapsible SETTINGS, `SectionHeader` pattern,
"* Required fields" footer note) **and** a flat hand-built inline modal in `CustomersListPage`
(+ edit variant, + a third on `CustomerProfilePage`). Add Company: three implementations
(CustomerFormModal's sub-modal `size="sm"`; CustomersListPage inline; CompaniesListPage create+edit
pair). The user's screenshots 1 vs 2 show the two different Add-Customer UIs live.

**M-3 · Footer anarchy (root cause: `Modal` has no footer slot).**
- Placement: in-body `border-t` with `pt-2` (LeaveManagement) / `pt-3` (RecordPayment, Invoice/Quote)
  / `pt-4` (majority) / `pt-6` (LoanForm/LoanDetail, ReportsDashboard); pinned `shrink-0`
  (DeviceFormModal `h-14`, CommandPalette, CasePeekPanel); **absent** on most View modals.
- On long forms the in-body footer **scrolls out of view** — Invoice, Quote, EmailDocument,
  SignatureCapture, DocumentDraftReview cited by the sweep as shipping unpinned footers today.
- Cancel variant split: `ghost` (CRM/settings/platform-admin/expenses) vs `secondary`
  (banking/cases/portal/quotes recycle bin) — two visual Cancels app-wide.
- Alignment ~always right; button order Cancel→Primary consistent (✓ the one solid convention).

**M-4 · Header deviations.** Standard header ~95% adopted. Deviants: `AnnouncementFormModal` renders
its own `h2 text-2xl font-bold` **outside** the Modal header plus a hand-rolled X (and `h-[90vh]`
custom shell); `DeviceFormModal` custom `h-12 px-6` header (sanctioned Workspace reference);
CreateCaseWizard's own header band; wizard step-breadcrumbs live in body. Portal detail-modal titles
were already flagged in the typography audit (F-3: `text-xl font-bold`).

**M-5 · Button styling inside modals bypasses the variant system in 4 places.** PortalQuotes
approve/reject use `className="bg-success…"`/`bg-danger…` on Buttons; `CategoryDetail` (master-data
CRUD — the screenshot's orange "Create") and `SystemNumbers` style the primary action from
`SETTINGS_CATEGORIES[].backgroundColor` via inline style (token-derived, theme-safe, but a
variant-system bypass — the only modals whose primary action is not a `Button` variant).

**M-6 · `ConfirmDialog`'s internal mismatch (post-P2b).** Confirm = raw 16px `rounded-lg py-2` button;
Cancel = ghost `Button` now 14px `rounded-md py-2.5`. Same row, two geometries. Also its X spec
(`p-1`, `top-4`, `text-slate-400`, `rounded`) differs from Modal's X (`p-1.5`, `top-3`, no color
class, `rounded-lg`) — two X designs within `ui/` itself (PhotoViewer's white-chip X is a third).

**M-7 · Ad-hoc height literals.** Five different height strategies where content must be constrained:
`h-[70vh]` (TemplateGallery), `h-[80vh]` (ArticleEditor), `h-[90vh]` (AnnouncementForm), nested
`max-h-[60vh]` (ReceiveStock), `lg:max-h-[420px]` (RecordReceipt right pane), plus an **inline style**
`maxHeight: '80vh'` (PaymentReceiptModal). No named tiers; each modal invents its own.

**M-8 · Body padding/layout departures.** Standard `p-4` body vs: ConfirmDialog `p-6`;
CustomerFormModal wraps content in `-mx-6 -mb-6` (over-bleeds a `p-4` body by 8px per side — worth a
visual check); DeviceFormModal `bg-surface-muted` body with card-wrapped sections (unique);
ArticleEditorModal split-pane with `w-72` fixed sidebar; ReceiveStock scroll-in-scroll.

**M-9 · Validation-message patterns.** Newer forms use `FormField`/primitives (12px + icon standard
from the typography program); older inline `text-xs mt-1` errors persist; some modals validate only
via toast; CustomerFormModal is the only one with a footer "* Required fields" legend; approve/reject
modals gate on required-notes with per-modal hand-rolled checks.

**M-10 · Stacking.** Nesting is real and works (ref-counted lock + Esc-topmost): wizard→CustomerForm→
AddCompany (triple), Invoice/Quote→catalog picker, DraftReview→SignatureCapture, CaseSuccess→Email→PDF
preview, InventoryDetail→3 children. Observation: stacked default scrims multiply (~40%+40% ⇒ ~64%
dim); EmailDocument's nested preview deliberately switches to `z-popover` + `bg-black/70`.

**M-11 · Size-tier vocabulary.** `xl` ≡ `large` (both `max-w-4xl`); size names ≠ rendered Tailwind
widths (`2xl`→6xl); both `size` and `maxWidth` coexist with a precedence rule. Distribution in use:
xs/sm ~18, md (default) ~45, lg ~24, xl/large ~11, 2xl/6xl/7xl ~7, maxWidth=3xl ×3.

---

## 5. Which Modals Already Follow the Standard

**Fully standard (≈78 instances, ~63%)** — default Modal header + X, `p-4` body, in-body right-aligned
Cancel→Primary footer, correct size tier, fits or scrolls sanely. All of: financial/HR forms (Expense,
Transaction, VATReturn, CreditNote, Transfer, Loan, Adjustment, SalaryComponent, Leave×4,
Timesheet×2…), settings/stock/inventory CRUD (CategoryDetail*, SystemNumbers*, CopyStyle,
StockTransaction, Bulk×2, AssignToCase, CompleteAssignment, ResourceCloneDrive…), admin/users forms
(UserForm, PasswordReset, Coupon, Plan, PlanFeature, Candidate, Job, Review, Checklist, Assign…), CRM
simple forms (Contact, Communication, DocumentUpload, FollowUp, SendMessage, CategoryManager…),
quotes/recycle-bin confirms. *(CategoryDetail/SystemNumbers standard except the M-5 accent button.)*

**Acceptable, documented deviations (≈24, ~19%)** — DeviceFormModal (Workspace reference: pinned
footer + pills), CommandPalette, CasePeekPanel, MobileNavDrawer, PhotoViewer/EmailDocument media
overrides, DocumentDraftReview/ArticleEditor split-panes, TemplateGalleryModal, wizards
(Import/Export/MFA/CreateCase), RecordReceipt's responsive split, ManageCompaniesModal's
alertdialog confirm panel.

**Needs standardization (≈22, ~18%)** — the M-1 bespoke confirms (15), M-2 duplicate entity forms
(5 inline implementations), AnnouncementFormModal (M-4), PortalQuotes buttons (M-5),
Invoice/Quote/PO/Supplier unpinned-footer long forms (M-3, overlapping), `ConfirmDialog` itself (M-6).

---

## 6. Zero-Scroll Analysis (special focus 1)

Assumption: usable body ≈ `90vh − header(~56px) − footer(~64px)` ≈ **550–620px** on a 768–900px
viewport; a one-column field row ≈ 76px; two-column halves that; textareas count ~2 rows.

| Tier | Count (≈) | Members (representative) | Lever |
|---|---|---|---|
| **Fits today** | 70 | every confirm; Expense/Transaction/CreditNote/Transfer/Loan/Adjustment/SalaryComponent; Leave/Timesheet modals; Contact/Communication/Upload; Coupon/PlanFeature/Assign; AssignToCase/MarkDefective/Complete; SendMessage/FollowUp (borderline) | none |
| **Could fit with layout change** | 30 | AccountFormModal (~650px→2-col), UserFormModal (~900→wider tier+2-col), PasswordChange (~700), PlanForm (~800), JobForm (~900→3-col), ReviewForm (~800), **SupplierFormModal (~1,200 → the DESIGN.md Workspace 4-col grid at 6xl ⇒ ~≤600px)**, CustomerFormModal (~900; Settings already collapsible; 2-col CONTACT/LOCATION), ExpenseDetail/PaymentView (~tight), LoanDetail (~800; schedule table is the driver), ReportsDashboard modal (~600+), ChecklistForm (N-items), LineItemTemplateForm (~650) | wider size tier + multi-column grid + collapsible sections (all already prescribed in DESIGN.md → Forms) |
| **Needs tabs / steps / pinned 3-region** | 15 | **InvoiceFormModal (~2,000px)**, **QuoteFormModal (~1,800px)**, **PurchaseOrderFormModal (~1,600px)** — line-item forms; StockSaleModal (dual-pane cart), StockItemFormModal (4 tabs already, size too small), InventoryItemWizard (family-dependent), RecordPaymentModal (allocation table — its split/pinned approach is the right shape already), ImportWizard steps | the DESIGN.md `TabbedFormModal` target (tabs + pinned footer); DeviceFormModal is the shipped reference |
| **Sanctioned tall/media** | 9 | ArticleEditor (80vh split), DraftReview, TemplateGallery preview, PhotoViewer, PaymentReceipt PDF, EmailDocument preview, CommandPalette, CasePeekPanel, MobileNavDrawer | none — by design |

**The two systemic levers** (already codified in DESIGN.md, awaiting adoption): (a) a **pinned footer**
(Modal footer slot / three-region composition) so long forms never scroll their actions away; (b) the
**Workspace 4-column grid** — ~35 fields in 4 columns ≈ 9 rows. Invoice/Quote were called out in
DESIGN.md as "the recon's #1 scroll offenders" in June and remain so.

---

## 7. X Close Button Census (special focus 2 — pattern slated for removal)

**Where the X comes from:**
| Source | Instances | Notes |
|---|---|---|
| `Modal.tsx` default (`showCloseButton=true`) | ~110 | One central render path (two variants: in-header, or absolute when title-less) |
| Explicit suppression | 1 | `PasswordChangeModal` (`showCloseButton={false}`, forced flow) |
| Own hand-rolled X | 7 | `ConfirmDialog` (slate-400, p-1, top-4), `DeviceFormModal` (slate-400 p-1.5 in custom header), `AnnouncementFormModal`, `MFAEnrollment` (disabled on final step), `PhotoViewerModal` (white/10 chip), `MobileNavDrawer` (slate-200 chip), `CasePeekPanel` (+ EmailDocumentModal's nested preview close) — **three+ distinct X visual specs coexist** |
| No X at all | ~6 | CommandPalette (Esc), DocumentViewerModal, SignatureCaptureModal (Cancel), DocumentDraftReview ("Close" button), RowActionsMenu/ColumnPicker (outside-click) |

**DESIGN.md references to strike when the pattern is removed (complete):**
1. `DESIGN.md` → Overlays → Anatomy item 1: "**Pinned header** — title + optional icon/badges + close button."
2. `DESIGN.md` → Z-Index Scale table, "base" row: "`Dialog`/`Modal` panel + **close buttons** (`z-10` *within* the overlay's own stacking context)".
   *(Line 219's ESC/backdrop-close behaviors are a separate mechanism and unaffected.)*
Code carriers: `Modal.tsx` (default + `showCloseButton` prop + title-less absolute variant),
`ConfirmDialog.tsx`, the 7 hand-rolled sites above, and `Modal.test.tsx`'s close-button assertions.

**Removal blockers — modals whose ONLY dismissal affordances are X + backdrop/Esc today** (each needs
a footer Close/Done before the X can go): `ExpenseDetailModal`, `PortalCases` detail,
`InventoryDetailModal`, `PaymentReceiptModal`, `DeviceDetailsModal`, `ManageCompaniesModal`,
`ReportsDashboard` report modal (has Close ✓ — verify), portal detail modals, `PhotoViewerModal`
(media lightbox — the highest-friction case; industry convention keeps an X on full-bleed media, so
this one deserves an explicit decision), `MobileNavDrawer` (nav drawer: backdrop tap is conventional;
still needs a visible affordance decision).

**Accessibility note (fact, not recommendation):** with X removed, keyboard/screen-reader users rely
on Esc + a focusable footer action; WCAG is satisfied only if **every** modal retains at least one
explicit close control — the list above is the gap set. `closeOnBackdrop={false}` forms (≈15, all
multi-step/destructive) already rely on footer buttons, proving the pattern works.

---

## 8. One Standardized Modal System? (special focus 3 — verdict)

**Yes at the primitive layer, no at the composition layer.** Single Dialog engine (scrim, trap, lock,
stack) with zero rogue full-screen overlays; but consumers compose four different "modal languages" on
top: (1) canonical Modal forms; (2) the Workspace/Dialog-direct tier (sanctioned, but only
DeviceFormModal implements the full pinned-footer + pills target — Invoice/Quote/PO haven't adopted
it); (3) bespoke Modal-confirms ignoring ConfirmDialog; (4) inline page-modals duplicating dedicated
components. DESIGN.md's own Overlays section already prescribes the end-state (three-region modal,
size tiers, `TabbedFormModal` scaffold "to be extracted") — the audit confirms the scaffold was never
extracted, and that absence is the single biggest driver of drift.

---

## 9. Duplicate Designs → Consolidation Candidates

1. **`ApprovalConfirmModal`** — one component for Leave approve/reject, Timesheet approve/reject,
   Expense approve/reject, PortalQuotes approve/reject (props: action, summary, requiresNotes).
2. **Entity forms** — retire the 5 inline customer/company modals in favor of `CustomerFormModal`
   (+ a `CompanyFormModal` extracted from the CompaniesListPage pair); SupplierFormModal shares the
   SectionHeader/collapsible pattern.
3. **Rich confirms** — a `ConfirmDialog` variant with a content slot (icon/tone/children) to absorb
   the 8 cases confirms + quotes restore/purge + DeleteInventory.
4. **`TabbedFormModal` scaffold** (already specified in DESIGN.md) — Invoice, Quote, PurchaseOrder,
   StockSale, StockItemForm, InventoryItemWizard.
5. **Bulk-stock trio** — BulkAdjustment/BulkPriceUpdate/StockTransaction share "form → preview calc →
   apply" (mode-driven single component).
6. **Inventory assignment lifecycle** — AssignToCase/MarkDefective/CompleteAssignment → one
   state-driven modal (kills a stacking level from InventoryDetailModal).
7. **Wizard scaffold** — ImportWizard/ExportWizard/MFAEnrollment share step-header + progress +
   `closeOnBackdrop=false` mechanics.
8. **PaymentView + PaymentReceipt** — coupled pair (view→print) could be one surface with a mode.
9. **Footer slot in `Modal`** + standardized Cancel variant — dissolves M-3 wholesale.

---

## 10. Screenshot Mapping & Observations

- **Screenshot 1 (Create New Case + stacked Add Customer):** CreateCaseWizard (Dialog-direct
  full-overlay) stacking `CustomerFormModal` — the sectioned variant with `SectionHeader` groups and
  the "* Required fields" legend. Stacked scrims visibly double-dim (M-10). Validation shown is the
  FormField-style red outline + 12px message (standard).
- **Screenshot 2 (Add New Customer from Customers list):** the *other* Add-Customer — the flat inline
  modal in `CustomersListPage` (M-2). Note it lacks the section headers, uses different spacing, and
  the red-circled **× inside Company/Country/City fields is not the modal-close X** — it is
  `SearchableSelect`'s clearable affordance. If the "remove X" directive is intended to cover these
  in-control clear buttons too, that is a separate pattern (consistent across SearchableSelect) and
  should be decided independently of the modal-close removal.
- **Screenshot 3 (Add New Company):** the CompaniesListPage inline implementation (M-2, third
  Add-Company variant); same clearable-select observation.
- **Screenshot 4 (Add New Supplier Categories):** `CategoryDetail` master-data CRUD modal — the one
  generic modal correctly reused for all master-data categories; its orange Create button is the
  category accent from `SETTINGS_CATEGORIES[].backgroundColor` via inline style (token-derived,
  theme-safe, but the variant-system bypass logged as M-5).
- **Screenshot 5 (User Management):** the red-boxed title block is an **in-page header leftover** —
  `UserManagement.tsx:257` still renders `text-2xl font-bold` + subtitle instead of the top-bar
  `PageHeaderSlot`; it was outside the header program's converted groups. Logged here as an
  observation for the next sweep (not a modal finding).

---

*End of audit. No code, styles, or configuration were modified; the only file added is this document.*
