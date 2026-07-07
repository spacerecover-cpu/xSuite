import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calculator,
  Download,
  LayoutGrid,
  LayoutPanelTop,
  Loader2,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Table as TableIcon,
  Building2,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useToast } from '../../../hooks/useToast';
import { logger } from '../../../lib/logger';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type ColorsConfig,
  type DocumentTemplateConfig,
  type FooterConfig,
  type HeaderConfig,
  type LanguageConfig,
  type LayoutConfig,
  type OrganizationConfig,
  type PageFittingConfig,
  type PageNumbersConfig,
  type PaperConfig,
  type PresentationConfig,
  type SignatureImageOptions,
  type SignatureImagesConfig,
  type StampImageOptions,
  type TableConfig,
  type TaxBarConfig,
  type TermsBodyText,
  type TermsContentConfig,
  type TaxSummaryConfig,
  type TemplateConfigOverride,
  type TemplateDocumentType,
  type TotalsConfig,
  type TotalsLineKey,
  type TotalsRowColor,
  type TranslationPolicyConfig,
  type TypographyConfig,
  type TypographyStyleKey,
  type WatermarkConfig,
} from '../../../lib/pdf/templateConfig';
import type { LanguageCode } from '../../../lib/documentTranslations';
import { DOC_TYPE_LABELS } from '../../../pages/settings/documentTypeMeta';
import { getCompanyLogo, getCompanyStamp, getCompanySignature } from '../../../lib/fileStorageService';
import { resolveBrandingImage, type BrandingImage } from '../../../lib/pdf/brandingImage';
import { fetchCompanySettings } from '../../../lib/pdf/dataFetcher';
import type { CompanySettingsData } from '../../../lib/pdf/types';
import { reportConfigForSubtype } from '../../../lib/pdf/engine/adapters/reportAdapter';
import { REPORT_TYPES } from '../../../lib/reportTypes';
import { GeneralTab } from './tabs/GeneralTab';
import { HeaderFooterTab } from './tabs/HeaderFooterTab';
import { TransactionTab } from './tabs/TransactionTab';
import { TableTab } from './tabs/TableTab';
import { TotalTab } from './tabs/TotalTab';
import { OtherDetailsTab } from './tabs/OtherDetailsTab';

/** The mutation + read surface every Studio tab consumes. */
export interface StudioApi {
  docType: TemplateDocumentType;
  resolved: DocumentTemplateConfig;
  override: TemplateConfigOverride;
  setPaper: (patch: Partial<PaperConfig>) => void;
  /** Patch the document language (mode / secondary / primary) — persists all
   *  three so the per-template secondary survives into the saved config. */
  setLanguage: (patch: Partial<LanguageConfig>) => void;
  setColors: (patch: Partial<ColorsConfig>) => void;
  /** Replace the whole colors group (smart-palette / clear). */
  setColorsAll: (colors: ColorsConfig | undefined) => void;
  setTypography: (patch: Partial<TypographyConfig>) => void;
  setTypographySize: (key: TypographyStyleKey, value: number | undefined) => void;
  setWatermark: (patch: Partial<WatermarkConfig>) => void;
  setHeader: (patch: Partial<HeaderConfig>) => void;
  setHeaderNudge: (patch: Partial<{ start: number; end: number; vertical: number }>) => void;
  setPageNumbers: (patch: Partial<PageNumbersConfig>) => void;
  setFooter: (patch: Partial<FooterConfig>) => void;
  setOrganization: (patch: Partial<OrganizationConfig>) => void;
  setOrgShow: (key: keyof NonNullable<OrganizationConfig['show']>, value: boolean) => void;
  setOrgManual: (key: keyof NonNullable<OrganizationConfig['manual']>, value: string) => void;
  setStampOptions: (patch: Partial<StampImageOptions>) => void;
  setSignatureOptions: (patch: Partial<SignatureImageOptions>) => void;
  setTaxBar: (patch: Partial<TaxBarConfig>) => void;
  setTable: (patch: Partial<TableConfig>) => void;
  setLayout: (patch: Partial<LayoutConfig>) => void;
  /** Premium presentation finish (cards / tables / title / signatures / footer). */
  setPresentation: (patch: Partial<PresentationConfig>) => void;
  setTranslationPolicy: (patch: Partial<TranslationPolicyConfig>) => void;
  setTranslationGroup: (group: keyof NonNullable<TranslationPolicyConfig['groups']>, value: boolean) => void;
  setTermsContent: (patch: Partial<TermsContentConfig>) => void;
  setPageFitting: (patch: Partial<PageFittingConfig>) => void;
  patchSection: (
    key: string,
    patch: {
      visible?: boolean;
      order?: number;
      bankStyle?: 'boxed' | 'inline';
      bankWidth?: 'auto' | 'half' | 'full';
      bankAlign?: 'left' | 'center' | 'right';
      headerBackground?: string;
    },
  ) => void;
  /** Patch a line-item column. `labelSecondary` writes to `label.i18n[secondary]`
   *  (and mirrors `.ar` when the secondary is Arabic); pass the active `secondary`. */
  patchColumn: (
    key: string,
    patch: { visible?: boolean; labelEn?: string; labelSecondary?: string; secondary?: LanguageCode | null; width?: number },
  ) => void;
  /** Write a section heading. `lang` is `'en'` or a secondary `LanguageCode`;
   *  a secondary writes to `label.i18n[code]` (and mirrors to `.ar` for `'ar'`). */
  setSectionLabel: (key: string, lang: 'en' | LanguageCode, value: string) => void;
  moveSection: (key: string, direction: -1 | 1) => void;
  setTotalsLine: (lineKey: string, on: boolean) => void;
  /** Total-section customisation (style + highlight). */
  setTotals: (patch: Partial<TotalsConfig>) => void;
  /** Per-line label override (blank clears it → default wording). */
  setTotalsLabel: (key: TotalsLineKey, value: string) => void;
  /** Opt-in per-row colour for the grand total / balance-due / tax rows. */
  setTotalsRowColor: (row: 'total' | 'balanceDue' | 'tax', patch: Partial<TotalsRowColor>) => void;
  /** Standalone VAT/GST breakdown table customisation. */
  setTaxSummary: (patch: Partial<TaxSummaryConfig>) => void;
}

interface TemplateStudioProps {
  docType: TemplateDocumentType;
  /**
   * For report templates: the report type this template is scoped to. The
   * built-in defaults and the live preview follow it, and the preview's
   * report-type picker is hidden. Absent (legacy shared base), the Studio keeps
   * a preview picker across all 8 types.
   */
  reportSubtype?: string;
  /** Card label for the heading / download name (defaults to the doc-type label). */
  titleLabel?: string;
  initialOverride: TemplateConfigOverride;
  isSaving: boolean;
  onBack: () => void;
  onSave: (override: TemplateConfigOverride) => void;
  /** Opens the "Choose a Template" gallery (wired by the parent page). */
  onOpenGallery?: () => void;
}

type TabId = 'general' | 'header' | 'transaction' | 'table' | 'total' | 'other';

const TABS: { id: TabId; label: string; icon: typeof Settings2 }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'header', label: 'Header & Footer', icon: LayoutPanelTop },
  { id: 'transaction', label: 'Transaction Details', icon: Building2 },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'total', label: 'Total', icon: Calculator },
  { id: 'other', label: 'Other Details', icon: LayoutGrid },
];

/**
 * The ultra-premium document Template Studio: a left tab rail, a scrollable
 * field panel per tab, and a live pdfmake preview that re-renders (debounced) as
 * the config changes. It edits a single {@link TemplateConfigOverride} on top of
 * the built-in default; Save deploys it. PDFs stay neutral unless the tenant
 * opts colors in; the app theme is never read into the document.
 */
export const TemplateStudio: React.FC<TemplateStudioProps> = ({
  docType,
  reportSubtype,
  titleLabel,
  initialOverride,
  isSaving,
  onBack,
  onSave,
  onOpenGallery,
}) => {
  const toast = useToast();
  const [override, setOverride] = useState<TemplateConfigOverride>(initialOverride);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  // Preview data source: 'sample' synthetic data, or a real record id.
  const [dataSource, setDataSource] = useState<string>('sample');
  const [records, setRecords] = useState<{ id: string; label: string }[]>([]);
  // A subtype-scoped template previews as its own report type. The legacy
  // shared base serves all 8, so it keeps a preview picker that renders each
  // one the exact way generation resolves it (subtype base + this override).
  const [previewSubtype, setPreviewSubtype] = useState<string>(reportSubtype ?? 'evaluation');
  const showSubtypePicker = docType === 'report' && !reportSubtype;
  const recordPreviewSupported =
    docType === 'invoice' || docType === 'quote' || docType === 'payment_receipt';

  const heading = titleLabel ?? DOC_TYPE_LABELS[docType];

  const builtIn = useMemo(
    () => (docType === 'report' ? reportConfigForSubtype(previewSubtype) : BUILT_IN_TEMPLATE_CONFIGS[docType]),
    [docType, previewSubtype],
  );

  const resolved = useMemo(
    () => resolveTemplateConfig(builtIn, undefined, override),
    [builtIn, override],
  );
  // The user explicitly set a document language (incl. "English Only") iff the
  // override carries one — that choice must override the tenant default in the
  // preview, so the preview matches the picker (and the saved/generated PDF).
  const languageExplicit = override.language !== undefined;

  // ---- Live preview (debounced, real pdfmake artifact) --------------------
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [tenantLogo, setTenantLogo] = useState<BrandingImage | null>(null);
  const [tenantStamp, setTenantStamp] = useState<BrandingImage | null>(null);
  const [tenantSignature, setTenantSignature] = useState<BrandingImage | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettingsData | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = setTimeout(async () => {
      try {
        const { preloadAllFonts } = await import('../../../lib/pdf/fonts');
        await preloadAllFonts();
        let url: string;
        let warnings: string[] = [];
        if (dataSource === 'sample') {
          const { previewTemplate } = await import('../../../lib/pdf/engine/previewTemplate');
          // Pass the tenant's real company settings so the sample preview shows the
          // tenant's own header/branding/language (predicting the generated PDF),
          // not the neutral bilingual sample company.
          ({ url, warnings } = await previewTemplate(
            docType,
            resolved,
            undefined,
            tenantLogo,
            tenantStamp,
            tenantSignature,
            companySettings ?? undefined,
            languageExplicit,
            docType === 'report' ? { reportSubtype: previewSubtype } : undefined,
          ));
        } else {
          const { previewDocumentForRecord } = await import('../../../lib/pdf/previewRecord');
          ({ url, warnings } = await previewDocumentForRecord(docType, dataSource, resolved, languageExplicit));
        }
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewWarnings(warnings);
      } catch (err) {
        if (cancelled) return;
        logger.error('[TemplateStudio] preview failed:', err);
        setPreviewError('Could not render the preview. Try adjusting a setting.');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resolved, languageExplicit, dataSource, docType, previewSubtype, tenantLogo, tenantStamp, tenantSignature, companySettings]);

  useEffect(() => () => {
    if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
  }, []);

  // Resolve the real tenant logo, stamp, and signature once so the sample
  // preview can draw them (and so a missing/broken logo surfaces a non-blocking
  // warning chip).
  useEffect(() => {
    let cancelled = false;
    fetchCompanySettings()
      .then((cs) => { if (!cancelled) setCompanySettings(cs); })
      .catch(() => { if (!cancelled) setCompanySettings(null); });
    getCompanyLogo('primary')
      .then((url) => resolveBrandingImage(url))
      .then((img) => { if (!cancelled) setTenantLogo(img); })
      .catch(() => { if (!cancelled) setTenantLogo({ kind: 'none', reason: 'empty' }); });
    getCompanyStamp()
      .then((url) => resolveBrandingImage(url))
      .then((img) => { if (!cancelled) setTenantStamp(img); })
      .catch(() => { if (!cancelled) setTenantStamp({ kind: 'none', reason: 'empty' }); });
    getCompanySignature()
      .then((url) => resolveBrandingImage(url))
      .then((img) => { if (!cancelled) setTenantSignature(img); })
      .catch(() => { if (!cancelled) setTenantSignature({ kind: 'none', reason: 'empty' }); });
    return () => { cancelled = true; };
  }, []);

  // Load recent records for the data-source picker (financial doc types only).
  useEffect(() => {
    if (!recordPreviewSupported) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    import('../../../lib/pdf/previewRecord')
      .then(({ listPreviewRecords }) => listPreviewRecords(docType))
      .then((r) => {
        if (!cancelled) setRecords(r);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [docType, recordPreviewSupported]);

  // ---- Mutators -----------------------------------------------------------
  const api: StudioApi = useMemo(() => {
    const mergeGroup = <K extends keyof TemplateConfigOverride>(
      key: K,
      patch: Partial<NonNullable<TemplateConfigOverride[K]>>,
    ) =>
      setOverride((prev) => ({
        ...prev,
        [key]: { ...(prev[key] as object | undefined), ...patch },
      }));

    return {
      docType,
      resolved,
      override,
      setPaper: (patch) => mergeGroup('paper', patch),
      setLanguage: (patch) =>
        setOverride((prev) => {
          const base = prev.language ?? builtIn.language;
          const next: LanguageConfig = { ...base, ...patch } as LanguageConfig;
          // Selecting "English Only" clears the secondary so the config returns to
          // the pure-English shape (no stray secondary lingering on a en/ar config).
          if (next.mode === 'en' && patch.secondary === undefined) delete next.secondary;
          return { ...prev, language: next };
        }),
      setColors: (patch) => mergeGroup('colors', patch),
      setColorsAll: (colors) => setOverride((prev) => ({ ...prev, colors })),
      setTypography: (patch) => mergeGroup('typography', patch),
      setTypographySize: (key, value) =>
        setOverride((prev) => {
          const sizes = { ...prev.typography?.sizes };
          if (value === undefined) delete sizes[key];
          else sizes[key] = value;
          return { ...prev, typography: { ...prev.typography, sizes } };
        }),
      setWatermark: (patch) => mergeGroup('watermark', patch),
      setHeader: (patch) => mergeGroup('header', patch),
      setHeaderNudge: (patch) =>
        setOverride((prev) => ({
          ...prev,
          header: { ...prev.header, dividerNudge: { ...prev.header?.dividerNudge, ...patch } },
        })),
      setPageNumbers: (patch) => mergeGroup('pageNumbers', patch),
      setFooter: (patch) => mergeGroup('footer', patch),
      setOrganization: (patch) => mergeGroup('organization', patch),
      setOrgShow: (key, value) =>
        setOverride((prev) => ({
          ...prev,
          organization: { ...prev.organization, show: { ...prev.organization?.show, [key]: value } },
        })),
      setOrgManual: (key, value) =>
        setOverride((prev) => ({
          ...prev,
          organization: { ...prev.organization, manual: { ...prev.organization?.manual, [key]: value } },
        })),
      setStampOptions: (patch) =>
        setOverride((prev) => {
          const signatureImages: SignatureImagesConfig = {
            ...prev.signatureImages,
            stamp: { ...prev.signatureImages?.stamp, ...patch },
          };
          return { ...prev, signatureImages };
        }),
      setSignatureOptions: (patch) =>
        setOverride((prev) => {
          const signatureImages: SignatureImagesConfig = {
            ...prev.signatureImages,
            signature: { ...prev.signatureImages?.signature, ...patch },
          };
          return { ...prev, signatureImages };
        }),
      setTaxBar: (patch) => mergeGroup('taxBar', patch),
      setTable: (patch) => mergeGroup('table', patch),
      setLayout: (patch) => mergeGroup('layout', patch),
      setPresentation: (patch) => mergeGroup('presentation', patch),
      setTranslationPolicy: (patch) => mergeGroup('translationPolicy', patch),
      setTranslationGroup: (group, value) =>
        setOverride((prev) => ({
          ...prev,
          translationPolicy: {
            ...prev.translationPolicy,
            groups: { ...prev.translationPolicy?.groups, [group]: value },
          },
        })),
      setTermsContent: (patch) =>
        setOverride((prev) => {
          // Deep-merge a Terms/Notes body so writing one language's i18n entry
          // (e.g. French) never drops another (e.g. a previously-authored Arabic).
          const mergeBody = (
            base: TermsBodyText | undefined,
            ov: TermsBodyText | undefined,
          ): TermsBodyText | undefined => {
            if (!ov) return base;
            return {
              ...base,
              ...ov,
              ...(base?.i18n || ov.i18n ? { i18n: { ...base?.i18n, ...ov.i18n } } : {}),
            };
          };
          return {
            ...prev,
            termsContent: {
              ...prev.termsContent,
              ...(patch.terms ? { terms: mergeBody(prev.termsContent?.terms, patch.terms) } : {}),
              ...(patch.notes ? { notes: mergeBody(prev.termsContent?.notes, patch.notes) } : {}),
            },
          };
        }),
      setPageFitting: (patch) => mergeGroup('pageFitting', patch),
      patchSection: (key, patch) =>
        setOverride((prev) => {
          const sections = [...(prev.sections ?? [])];
          const idx = sections.findIndex((s) => s.key === key);
          if (idx >= 0) sections[idx] = { ...sections[idx], ...patch };
          else sections.push({ key, ...patch });
          return { ...prev, sections };
        }),
      patchColumn: (columnKey, patch) =>
        setOverride((prev) => {
          const sections = [...(prev.sections ?? [])];
          let li = sections.find((s) => s.key === 'lineItems');
          if (!li) {
            li = { key: 'lineItems', columns: [] };
            sections.push(li);
          }
          const columns = [...(li.columns ?? [])];
          const cIdx = columns.findIndex((c) => c.key === columnKey);
          const existing = columns[cIdx] ?? { key: columnKey };
          const secondary = patch.secondary ?? null;
          const writesLabel = patch.labelEn !== undefined || patch.labelSecondary !== undefined;
          const next = {
            ...existing,
            ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
            ...(patch.width !== undefined ? { width: patch.width > 0 ? patch.width : undefined } : {}),
            ...(writesLabel
              ? {
                  label: {
                    ...existing.label,
                    ...(patch.labelEn !== undefined ? { en: patch.labelEn } : {}),
                    // Secondary column label → label.i18n[code] (mirror `.ar` for Arabic).
                    ...(patch.labelSecondary !== undefined && secondary
                      ? {
                          i18n: { ...existing.label?.i18n, [secondary]: patch.labelSecondary },
                          ...(secondary === 'ar' ? { ar: patch.labelSecondary } : {}),
                        }
                      : {}),
                  },
                }
              : {}),
          };
          if (cIdx >= 0) columns[cIdx] = next;
          else columns.push(next);
          const sIdx = sections.findIndex((s) => s.key === 'lineItems');
          sections[sIdx] = { ...li, columns };
          return { ...prev, sections };
        }),
      setSectionLabel: (key, lang, value) =>
        setOverride((prev) => {
          const labels = { ...(prev.labels ?? {}) };
          const existing = labels[key] ?? { en: '' };
          if (lang === 'en') {
            labels[key] = { ...existing, en: value };
          } else {
            // Secondary heading → label.i18n[code]; also mirror to the legacy `.ar`
            // slot when the secondary is Arabic so deployed `{en,ar}` readers see it.
            labels[key] = {
              ...existing,
              i18n: { ...existing.i18n, [lang]: value },
              ...(lang === 'ar' ? { ar: value } : {}),
            };
          }
          return { ...prev, labels };
        }),
      moveSection: (key, direction) => {
        const ordered = [...resolved.sections].sort((a, b) => a.order - b.order);
        const idx = ordered.findIndex((s) => s.key === key);
        const swapIdx = idx + direction;
        if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
        setOverride((prev) => {
          const sections = [...(prev.sections ?? [])];
          const setOrder = (k: string, order: number) => {
            const i = sections.findIndex((s) => s.key === k);
            if (i >= 0) sections[i] = { ...sections[i], order };
            else sections.push({ key: k, order });
          };
          setOrder(ordered[idx].key, ordered[swapIdx].order);
          setOrder(ordered[swapIdx].key, ordered[idx].order);
          return { ...prev, sections };
        });
      },
      setTotalsLine: (lineKey, on) =>
        setOverride((prev) => {
          const sections = [...(prev.sections ?? [])];
          let totals = sections.find((s) => s.key === 'totals');
          if (!totals) {
            totals = { key: 'totals', lines: {} };
            sections.push(totals);
          }
          const tIdx = sections.findIndex((s) => s.key === 'totals');
          sections[tIdx] = { ...totals, lines: { ...totals.lines, [lineKey]: on } };
          return { ...prev, sections };
        }),
      setTotals: (patch) => mergeGroup('totals', patch),
      setTotalsLabel: (key, value) =>
        setOverride((prev) => {
          const labels = { ...prev.totals?.labels };
          if (value.trim() === '') delete labels[key];
          else labels[key] = value;
          return { ...prev, totals: { ...prev.totals, labels } };
        }),
      setTotalsRowColor: (row, patch) =>
        setOverride((prev) => ({
          ...prev,
          totals: {
            ...prev.totals,
            rowColors: { ...prev.totals?.rowColors, [row]: { ...prev.totals?.rowColors?.[row], ...patch } },
          },
        })),
      setTaxSummary: (patch) => mergeGroup('taxSummary', patch),
    };
  }, [docType, resolved, override]);

  const handleReset = () => {
    setOverride({});
    toast.info('Reverted to the default layout. Save to apply.');
  };

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 transition-colors hover:bg-slate-100" aria-label="Back to documents">
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{heading} template</h1>
            <p className="text-sm text-slate-600">Design every detail. The preview updates live.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOpenGallery && (
            <Button variant="secondary" size="sm" onClick={onOpenGallery}>
              <Sparkles className="mr-2 h-4 w-4" />
              Browse templates
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button size="sm" onClick={() => onSave(override)} isLoading={isSaving} loadingLabel="Saving">
            <Save className="mr-2 h-4 w-4" />
            Save &amp; deploy
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[168px_minmax(0,1fr)_minmax(0,55%)]">
        {/* Tab rail */}
        <nav aria-label="Template settings" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex flex-shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Field panel */}
        <Card variant="bordered" className="p-5 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          {activeTab === 'general' && <GeneralTab api={api} />}
          {activeTab === 'header' && <HeaderFooterTab api={api} />}
          {activeTab === 'transaction' && <TransactionTab api={api} />}
          {activeTab === 'table' && <TableTab api={api} />}
          {activeTab === 'total' && <TotalTab api={api} />}
          {activeTab === 'other' && <OtherDetailsTab api={api} />}
        </Card>

        {/* Live preview */}
        <div className="lg:sticky lg:top-5 lg:self-start">
          <Card variant="bordered" className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-medium text-slate-700">Live preview</span>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    download={`${heading}${
                      dataSource !== 'sample' ? `-${records.find((r) => r.id === dataSource)?.label ?? ''}` : ''
                    }.pdf`.replace(/[^\w.\-]+/g, '-')}
                    title="Download the rendered PDF"
                    aria-label="Download the rendered PDF"
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                )}
                {showSubtypePicker && (
                  <select
                    aria-label="Preview report type"
                    value={previewSubtype}
                    onChange={(e) => setPreviewSubtype(e.target.value)}
                    className="max-w-[190px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {Object.values(REPORT_TYPES).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}
                {recordPreviewSupported && records.length > 0 && (
                  <select
                    aria-label="Preview data source"
                    value={dataSource}
                    onChange={(e) => setDataSource(e.target.value)}
                    className="max-w-[170px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="sample">Sample data</option>
                    {records.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                )}
                {previewLoading && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </span>
                )}
              </div>
            </div>
            {previewWarnings.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-2">
                {previewWarnings.map((w) => (
                  <span
                    key={w}
                    className="inline-flex items-center gap-1 rounded-md bg-warning-muted px-2 py-1 text-xs font-medium text-warning-foreground"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
            <div className="relative h-[calc(100vh-12rem)] min-h-[480px] bg-slate-200">
              {previewError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-sm text-danger">{previewError}</p>
                </div>
              ) : previewUrl ? (
                // PDF open-parameters strip the native viewer's toolbar + thumbnail
                // rail and fit the page to the pane width, so the preview shows the
                // document large + clean instead of a small page inside dark chrome.
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&statusbar=0&view=FitH`}
                  title={`${heading} preview`}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
            </div>
          </Card>
          <p className="mt-2 text-xs text-slate-500">
            Preview uses sample data. PDFs stay neutral unless you opt colors in.
          </p>
        </div>
      </div>
    </div>
  );
};
