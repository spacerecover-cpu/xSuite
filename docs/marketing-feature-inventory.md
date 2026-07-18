# xSuite — Marketing Feature Inventory & Reel/Content Playbook

> **Audience:** the marketing team making Instagram / Facebook reels, carousels, and short-form content.
> **Purpose:** a plain-language, sales-ready catalog of everything xSuite actually does today, grouped by story, with ready-to-shoot content angles. Every feature below is grounded in the shipped codebase (routes, pages, services, PDF documents), not roadmap.
>
> **Positioning in one line:** *xSuite is the purpose-built operating system for data-recovery labs — the only platform that tracks every physical drive with forensic chain-of-custody from intake to return, while running the whole business (quotes, invoices, inventory, HR, payroll) in one place.*
>
> **What it is NOT (do not market as):** a generic CRM, a helpdesk, or a ticketing tool. The whole pitch is that generic CRMs *break* for recovery labs and xSuite is built exactly for the lab workflow.

---

## ⚠️ Accuracy guardrails — read before writing copy

| Claim | Verdict | Why |
|---|---|---|
| "AI-powered" / "AI recovery" / "AI assistant" | ❌ **Do not use** | There are **no AI features in the product today** (no AI service, no LLM integration). The phrase appears in internal docs as aspiration only. Marketing it would be false advertising. |
| "Forensic chain of custody" | ✅ **Lead with it** | Real, tamper-evident custody ledger with hash/seal integrity checks and a printable custody log. This is the #1 differentiator. |
| "Track every drive in a RAID individually" | ✅ **Use it** | Multi-device-per-case is genuinely built; bulk-add drives for RAID/servers. |
| "Customer portal" | ✅ **Use it** | Branded self-service portal is live (track case, approve quotes, pay, download docs). |
| "GST / VAT / ZATCA compliant invoicing" | ✅ **Use it (region-specific)** | India GST, GCC/Gulf tax invoices, and ZATCA (Saudi) e-invoice QR are all implemented. Match the claim to the audience's country. |
| "Certificate of destruction" | ✅ **Use it** | Media-disposal / destruction reporting is built into the report engine. |
| "Recover any device / guaranteed recovery" | ❌ **Never** | The software manages the lab; it does not perform recovery and cannot promise outcomes. |

---

## 1. HERO FEATURES — the differentiators (best reel material)

These are what make xSuite *not a CRM*. Each one solves a pain a generic tool can't. Lead your content calendar with these.

### 1.1 Forensic Chain of Custody 🔒 *(flagship)*
Every physical drive gets a tamper-evident custody ledger that starts the moment it's received and logs every hand-off, access, transfer, and check-out — with cryptographic hash/seal integrity checks. Custody events are append-only (can't be edited or deleted), and the full log prints as a court-ready PDF.
- **Where in app:** Case → Chain of Custody tab; Custody Transfer flow; PDF "Chain of Custody" document.
- **Pain it kills:** "Who touched this drive, and can you prove it?" — critical for NDAs, legal cases, and enterprise clients.
- **Reel angle:** *"Your CRM can't prove who touched the drive. Ours can."* — screen-record a drive's full custody timeline printing to PDF.

### 1.2 Multi-Device & RAID Tracking 🧩
One case can hold many individually-tracked devices — a 12-drive RAID is 12 tracked drives, not one line item. Each drive carries its own type, brand, serial, capacity, condition-on-arrival, and role (patient vs. donor). Bulk-add drives for servers/RAID arrays in one step.
- **Where in app:** Create Case Wizard → devices array; Server/Bulk Drives modal; Case → Devices tab.
- **Pain it kills:** Generic tools collapse a 12-drive job into one record and lose track of individual drives.
- **Reel angle:** *"A RAID isn't one job — it's 12 drives. Here's how we track all of them."*

### 1.3 The 16-Stage Recovery Lifecycle (guided) 🔄
A single, standardized workflow from **enquiry → intake → diagnosis → quote → approval → recovery → QA → ready → delivery → closure**, with a guided stage banner that tells staff exactly what's needed to advance. Status transitions are enforced (you can't skip evidence).
- **Where in app:** Case Detail stage banner; Case Lifecycle settings.
- **Reel angle:** a fast time-lapse of a case moving through every stage, badge by badge.

### 1.4 Recovery Outcome & Re-Recovery 🎯
Outcome is a first-class badge — **Full / Partial / Unrecoverable / Declined** — separate from status. Failed jobs can be re-opened as a linked **Re-Recovery** case with fresh custody, while preserving the original history. "No Solution — Future Follow-up" cases are parked with a structured reason and a scheduled review.
- **Reel angle:** *"Partial recovery is still a win — and we track it honestly."*

### 1.5 QA Sign-off & Recovery Evidence ✅
An optional-but-enforceable QA gate: recovery attempts must be logged as evidence before a case leaves recovery, and a QA checklist gates the jump to "ready." Turn QA on/off per lab.
- **Reel angle:** *"Nothing ships until QA signs off."*

### 1.6 Branded Customer Portal 🌐
A self-service portal your clients log into to track their case status in real time, review & approve quotes, view/download documents (reports, invoices), make payments, see their purchases, and message the lab — all under your branding.
- **Where in app:** `/portal` — Dashboard, Cases, Quotes, Documents, Payments, Purchases, Communications, Settings.
- **Pain it kills:** endless "any update on my drive?" phone calls.
- **Reel angle:** split-screen — customer's phone view vs. lab's dashboard, updating live.

### 1.7 Certificate of Destruction / Secure Media Disposal 🗑️
Close a case as "Device Returned" **or** "Media Disposed," with destruction reporting built into the document engine — the proof enterprise and compliance-driven clients demand.
- **Reel angle:** *"When the data has to die, you get the certificate to prove it."*

---

## 2. FULL FEATURE CATALOG (by module)

Everything the product does, organized the way the app's own navigation is. Use this as the master checklist when planning a content series.

### 2.1 Core Operations
- **Dashboard** — live KPIs, cases-due-today badge, activity at a glance.
- **Cases command center** — list, filter, buckets by phase (active / delivered / closed / no-solution), create-case wizard, per-case detail with tabs (devices, custody, diagnostics, engineers, notes, QA, history, reports, quotes, attachments, communications, milestones, follow-ups).

### 2.2 Financial
- **Quotes** — build, send, customer approval, quote history, recycle bin.
- **Invoices** — tax invoices & proforma, convert proforma → tax invoice, line items.
- **Payments** — record, allocate, receipts, disbursements; printable payment receipts.
- **Expenses** — track with attachments.
- **Revenue / Finance dashboard** — income view.
- **Transactions** — full financial transaction ledger.
- **Banking** — bank accounts, transactions, reconciliation sessions, transfers, balance snapshots.
- **VAT & Audit** — tax records, VAT returns, financial audit logs.
- **Financial Reports** — reporting dashboard.
- **Import / Export** — bulk data in/out.

### 2.3 Business
- **Customers** — profiles, groups, communications, company relationships, NDAs.
- **Companies** — B2B accounts, documents, settings, per-company primary contact.
- **Suppliers** — profiles, contacts, communications, documents, performance metrics, products.
- **Purchase Orders** — raise & track POs against suppliers.

### 2.4 Resources (the lab floor)
- **Inventory** — parts, tools, locations, assignments to cases, photos, reservations, transactions.
- **Donor Drive Search** — search compatible donor drives (donor-compatibility matrix) — huge for recovery labs.
- **Stock** — items, categories, sales, adjustments, locations, serial numbers, movements, low-stock alerts, price history, reports.
- **Clone Drives** — track imaging/clone drive resources.
- **Knowledge Base (Procedures)** — internal articles, categories, tags, versions; help center.

### 2.5 Human Resources
- **HR Dashboard**, **Employees** (profiles, documents, salary config), **Recruitment** (jobs & candidates), **Onboarding** (checklists & tasks), **Performance Reviews**.

### 2.6 Payroll
- **Payroll dashboard**, **Process Payroll** (periods & runs), **Salary Components**, **History**, **Adjustments**, **Employee Loans** (with repayments), **Settings**; payroll bank files & payslip PDFs.

### 2.7 Employee Management
- **Attendance**, **Leave Management** (balances & requests), **Timesheets**.

### 2.8 System & Admin
- **Settings hub** — general, appearance/theming, tax registration, preferences, table columns, case lifecycle, feature toggles, system numbers, localization, currencies, client-portal config, billing & plans, documents, **Label Studio**, security, GDPR compliance, inventory settings, notifications.
- **User Management** — invite users, 8-role hierarchy (owner → admin → manager → technician / sales / accounts / hr → viewer), role-module permissions.
- **Admin Panel** — system logs, audit trails, database management, role permissions, tenant management.

---

## 3. PLATFORM & TRUST FEATURES (B2B credibility angles)

Great for LinkedIn-style credibility posts and "why enterprise labs choose us" content.

- **Multi-tenant SaaS** — each lab is fully isolated; strict tenant separation (a real security selling point).
- **Multi-country / Country Packs** — currency, tax system, date format, timezone, locale, and compliance auto-configure from the lab's country at signup.
- **Multi-currency** — per-tenant currency with correct symbol, decimals, and formatting everywhere.
- **Tax-compliance document engine:**
  - **India GST** — GSTIN & HSN handling, GSTR periods, INV-01 fields, credit notes, delivery challans.
  - **GCC / Gulf tax invoices** — compliant tax-invoice layout.
  - **ZATCA (Saudi Arabia)** — e-invoice QR code rendering on documents.
  - **VAT / generic** regimes for other regions.
- **Branded PDF documents** (programmatic, print-perfect): invoices, quotes, receipts, payment receipts, delivery challans, case labels, inventory/stock labels, payslips, chain-of-custody logs, recovery reports, checkout/customer-copy forms — **with Arabic / RTL support**.
- **4 tenant themes** — Royal, Burgundy, Scarlet, and the flagship **Midnight Aurora** premium dark theme. Every lab can match its own brand. *(Visually stunning — perfect for a "look how good it looks" reel.)*
- **Role-based permissions** across 8 roles; audit trails; system logs; GDPR compliance page; NDA management; security settings.
- **Notifications** — in-app bell + history, per-user preferences.

---

## 4. CONTENT & REEL IDEA BANK

Ready-to-shoot concepts. Mix hero features (section 1) with quick "did you know" breadth (section 2).

### Reels (15–30s, hook in first 2s)
1. **"Your CRM loses drives. Watch."** — RAID with 12 drives → show all 12 tracked individually. *(Feature 1.2)*
2. **"Can you prove who touched this drive?"** — scroll a tamper-proof custody timeline, then print the PDF. *(1.1)*
3. **"From dead drive to delivered data"** — time-lapse a case through all 16 stages. *(1.3)*
4. **"Stop answering 'any update?' calls"** — customer opens the portal on their phone and sees live status. *(1.6)*
5. **"When data has to be destroyed, get the certificate."** — media-disposal close + destruction doc. *(1.7)*
6. **Theme reveal** — one dashboard flipping between Royal → Burgundy → Scarlet → Midnight Aurora. *(section 3)*
7. **"One tool for the whole lab"** — fast montage: case → quote → invoice → inventory → payroll. *(breadth)*
8. **"Partial recovery is still a win"** — outcome badges + re-recovery link. *(1.4)*

### Carousels (educational / save-worthy)
- *"The 16 stages of a data recovery job"* — one slide per stage.
- *"5 things a generic CRM can't do for a recovery lab"* — custody, RAID tracking, donor search, QA gate, destruction certs.
- *"What your client sees in the portal"* — screenshot tour.
- *"Every document your lab needs, auto-generated"* — grid of the branded PDFs.

### Story / short-form series
- **"Lab tip of the day"** pulled from the Knowledge Base concept.
- **"Feature Friday"** — one module per week from section 2.
- **Before/after** — spreadsheet chaos vs. xSuite dashboard.

### Demo hooks by audience
- **Independent labs:** breadth ("run your whole business in one app").
- **Enterprise / forensic labs:** custody + audit + destruction certs + tenant isolation.
- **Gulf / India / KSA labs:** the region-specific tax compliance (GST / GCC / ZATCA).

---

## 5. FEATURE → BENEFIT CHEAT-SHEET (for captions)

| Feature | Say this in the caption |
|---|---|
| Chain of custody | "Prove exactly who handled every drive." |
| Multi-device / RAID | "Track every drive in the array — individually." |
| Donor drive search | "Find the right donor drive in seconds." |
| Customer portal | "Your clients check status themselves — 24/7." |
| Quotes & approval | "Send a quote, get approval, start recovery — no back-and-forth." |
| QA sign-off | "Nothing ships until QA passes." |
| Recovery outcome badges | "Full, partial, or no-solution — tracked honestly." |
| Certificate of destruction | "Compliant proof when media must be destroyed." |
| Tax compliance (GST/VAT/ZATCA) | "Invoices that are compliant in your country, automatically." |
| Themes | "Make it match your brand." |
| Inventory + stock | "Never lose a part — or a screw." |
| HR + payroll | "Pay your team without leaving the app." |
| Multi-tenant isolation | "Your data is yours alone." |

---

*Maintained for the marketing team. When in doubt about whether a feature is real, check with engineering before it ships in an ad — the accuracy guardrails in section 0 are non-negotiable.*
