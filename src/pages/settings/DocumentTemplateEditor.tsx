import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type ColumnConfig,
  type DocumentTemplateConfig,
  type LanguageMode,
  type PaperConfig,
  type SectionConfig,
  type TemplateConfigOverride,
  type TemplateDocumentType,
} from '../../lib/pdf/templateConfig';
import { DOC_TYPE_LABELS } from './documentTypeMeta';

const LANGUAGE_OPTIONS: { value: LanguageMode; label: string }[] = [
  { value: 'en', label: 'English only' },
  { value: 'ar', label: 'Arabic only' },
  { value: 'bilingual_stacked', label: 'Bilingual — stacked' },
  { value: 'bilingual_sidebyside', label: 'Bilingual — side by side' },
];

const PAPER_SIZE_OPTIONS: { value: PaperConfig['size']; label: string }[] = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter' },
];

const ORIENTATION_OPTIONS: { value: PaperConfig['orientation']; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

/** Human labels for the engine section keys (config keys are terse). */
const SECTION_LABELS: Record<string, string> = {
  header: 'Header & logo',
  parties: 'Customer / party details',
  meta: 'Document details (number, dates)',
  caseInfo: 'Case information',
  devices: 'Devices',
  collector: 'Collector',
  lineItems: 'Line items table',
  totals: 'Totals',
  terms: 'Terms & notes',
  bank: 'Bank details',
  signature: 'Signature block',
  qr: 'QR code',
  footer: 'Footer',
  custodyLog: 'Chain-of-custody log',
  employee: 'Employee',
  period: 'Pay period',
  earnings: 'Earnings',
  deductions: 'Deductions',
  summary: 'Summary',
  findings: 'Findings',
  sections: 'Report sections',
  stockInfo: 'Stock information',
};

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2');
}

interface DocumentTemplateEditorProps {
  docType: TemplateDocumentType;
  /** The starting override (the deployed version's config, or empty for default). */
  initialOverride: TemplateConfigOverride;
  /** Whether a save is in flight (drives the Save button spinner / disabled state). */
  isSaving: boolean;
  onBack: () => void;
  onSave: (override: TemplateConfigOverride) => void;
}

/**
 * The split-pane editor for a single document type. LEFT is a field-toggle form
 * bound to the template's {@link TemplateConfigOverride}; RIGHT is a live PDF
 * preview that re-renders (debounced ~300ms) as the form changes.
 *
 * The form edits an OVERRIDE layer on top of {@link BUILT_IN_TEMPLATE_CONFIGS},
 * exactly as the persistence cascade expects: the resolved config (built-in +
 * override) drives both the preview and the saved version. Reset clears the
 * override back to the built-in default.
 */
export const DocumentTemplateEditor: React.FC<DocumentTemplateEditorProps> = ({
  docType,
  initialOverride,
  isSaving,
  onBack,
  onSave,
}) => {
  const toast = useToast();
  const builtIn = BUILT_IN_TEMPLATE_CONFIGS[docType];
  const [override, setOverride] = useState<TemplateConfigOverride>(initialOverride);

  // The resolved, render-ready config (built-in default ← this override).
  const resolved: DocumentTemplateConfig = useMemo(
    () => resolveTemplateConfig(builtIn, undefined, override),
    [builtIn, override],
  );

  // ---- Live preview (debounced) -------------------------------------------
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    const timer = setTimeout(async () => {
      try {
        const [{ preloadAllFonts }, { previewTemplate }] = await Promise.all([
          import('../../lib/pdf/fonts'),
          import('../../lib/pdf/engine/previewTemplate'),
        ]);
        await preloadAllFonts();
        const url = await previewTemplate(resolved);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setPreviewUrl(url);
      } catch (err) {
        if (cancelled) return;
        logger.error('[DocumentTemplateEditor] preview failed:', err);
        setPreviewError('Could not render the preview. Try adjusting a setting.');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resolved]);

  // Revoke the final preview url on unmount.
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  // ---- Override mutators ---------------------------------------------------
  const setPaper = (patch: Partial<PaperConfig>) =>
    setOverride((prev) => ({ ...prev, paper: { ...prev.paper, ...patch } }));

  const setLanguage = (mode: LanguageMode) =>
    setOverride((prev) => ({
      ...prev,
      language: { ...prev.language, mode, primary: mode === 'ar' ? 'ar' : prev.language?.primary ?? 'en' },
    }));

  const setBranding = (patch: Partial<{ accent: string; watermark: string | null }>) =>
    setOverride((prev) => ({ ...prev, branding: { ...prev.branding, ...patch } }));

  /** Merge a section-level override by key onto the existing override list. */
  const patchSection = (
    key: string,
    patch: Partial<{ visible: boolean; order: number }>,
  ) =>
    setOverride((prev) => {
      const sections = [...(prev.sections ?? [])];
      const idx = sections.findIndex((s) => s.key === key);
      if (idx >= 0) sections[idx] = { ...sections[idx], ...patch };
      else sections.push({ key, ...patch });
      return { ...prev, sections };
    });

  /** Merge a column-level override (visible / label) onto the lineItems section. */
  const patchColumn = (
    columnKey: string,
    patch: { visible?: boolean; labelEn?: string; labelAr?: string },
  ) =>
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
      const next = {
        ...existing,
        ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
        ...(patch.labelEn !== undefined || patch.labelAr !== undefined
          ? {
              label: {
                ...existing.label,
                ...(patch.labelEn !== undefined ? { en: patch.labelEn } : {}),
                ...(patch.labelAr !== undefined ? { ar: patch.labelAr } : {}),
              },
            }
          : {}),
      };
      if (cIdx >= 0) columns[cIdx] = next;
      else columns.push(next);
      const liNext = { ...li, columns };
      const sIdx = sections.findIndex((s) => s.key === 'lineItems');
      sections[sIdx] = liNext;
      return { ...prev, sections };
    });

  /** Per-section label override (EN/AR) keyed by `section.key` → labels dict. */
  const setSectionLabel = (key: string, lang: 'en' | 'ar', value: string) =>
    setOverride((prev) => {
      const labels = { ...(prev.labels ?? {}) };
      const existing = labels[key] ?? { en: '' };
      labels[key] = { ...existing, [lang]: value };
      return { ...prev, labels };
    });

  const moveSection = (key: string, direction: -1 | 1) => {
    const ordered = [...resolved.sections].sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((s) => s.key === key);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swapIdx];
    patchSection(a.key, { order: b.order });
    patchSection(b.key, { order: a.order });
  };

  const handleReset = () => {
    setOverride({});
    toast.info('Reverted to the default layout. Save to apply.');
  };

  const orderedSections = useMemo(
    () => [...resolved.sections].sort((a, b) => a.order - b.order),
    [resolved.sections],
  );

  const lineItemColumns: ColumnConfig[] = useMemo(() => {
    const li = resolved.sections.find((s) => s.key === 'lineItems');
    return li?.columns ?? [];
  }, [resolved.sections]);

  const totalsSection: SectionConfig | undefined = useMemo(
    () => resolved.sections.find((s) => s.key === 'totals'),
    [resolved.sections],
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Back to documents"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-0.5">
              {DOC_TYPE_LABELS[docType]} template
            </h1>
            <p className="text-slate-600 text-sm">
              Toggle sections, rename columns, and set the language. The preview updates live.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to default
          </Button>
          <Button size="sm" onClick={() => onSave(override)} isLoading={isSaving} loadingLabel="Saving">
            <Save className="w-4 h-4 mr-2" />
            Save &amp; deploy
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — field-toggle form */}
        <div className="space-y-6 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-2">
          {/* Layout */}
          <Card variant="bordered" className="p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Page layout</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Paper size"
                value={resolved.paper.size}
                onChange={(e) => setPaper({ size: e.target.value as PaperConfig['size'] })}
                options={PAPER_SIZE_OPTIONS}
              />
              <Select
                label="Orientation"
                value={resolved.paper.orientation}
                onChange={(e) =>
                  setPaper({ orientation: e.target.value as PaperConfig['orientation'] })
                }
                options={ORIENTATION_OPTIONS}
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Margins (points): top / right / bottom / left
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['top', 'right', 'bottom', 'left'] as const).map((side, i) => (
                  <Input
                    key={side}
                    type="number"
                    min={0}
                    aria-label={`${side} margin`}
                    value={resolved.paper.margins[i]}
                    onChange={(e) => {
                      const next = [...resolved.paper.margins] as PaperConfig['margins'];
                      next[i] = Number(e.target.value) || 0;
                      setPaper({ margins: next });
                    }}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Language */}
          <Card variant="bordered" className="p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Language</h2>
            <Select
              label="Document language"
              value={resolved.language.mode}
              onChange={(e) => setLanguage(e.target.value as LanguageMode)}
              options={LANGUAGE_OPTIONS}
              hint="Bilingual modes show English and Arabic together."
            />
          </Card>

          {/* Branding — opt-in accent + watermark (PDFs neutral by default) */}
          <Card variant="bordered" className="p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Branding</h2>
            <p className="text-sm text-slate-500 mb-4">
              PDFs stay neutral by default. Opt into a brand accent and add a watermark.
              The logo is managed in General settings.
            </p>
            <label className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 cursor-pointer">
              <span className="text-sm font-medium text-slate-800">Use a brand accent color</span>
              <input
                type="checkbox"
                checked={resolved.branding.accent !== 'inherit'}
                onChange={(e) => setBranding({ accent: e.target.checked ? '#162660' : 'inherit' })}
                className="h-4 w-4 rounded border-slate-300 text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            {resolved.branding.accent !== 'inherit' && (
              <div className="mb-4 flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Accent color"
                  value={/^#[0-9a-fA-F]{6}$/.test(resolved.branding.accent) ? resolved.branding.accent : '#162660'}
                  onChange={(e) => setBranding({ accent: e.target.value })}
                  className="h-9 w-12 rounded border border-slate-300 bg-white p-1"
                />
                <Input
                  aria-label="Accent color hex"
                  value={resolved.branding.accent}
                  onChange={(e) => setBranding({ accent: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Watermark text</label>
              <Input
                placeholder="e.g. DRAFT, CONFIDENTIAL (blank for none)"
                value={resolved.branding.watermark ?? ''}
                onChange={(e) => setBranding({ watermark: e.target.value || null })}
              />
            </div>
          </Card>

          {/* Sections — visibility, order, per-section labels */}
          <Card variant="bordered" className="p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Sections</h2>
            <p className="text-sm text-slate-500 mb-4">
              Show or hide sections, reorder them, and rename their headings.
            </p>
            <ul className="space-y-2">
              {orderedSections.map((section, index) => {
                const label = resolved.labels[section.key];
                return (
                  <li
                    key={section.key}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <button
                          aria-label={`Move ${sectionLabel(section.key)} up`}
                          disabled={index === 0}
                          onClick={() => moveSection(section.key, -1)}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                        >
                          ▲
                        </button>
                        <GripVertical className="w-4 h-4 text-slate-300" aria-hidden="true" />
                        <button
                          aria-label={`Move ${sectionLabel(section.key)} down`}
                          disabled={index === orderedSections.length - 1}
                          onClick={() => moveSection(section.key, 1)}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                        >
                          ▼
                        </button>
                      </div>
                      <span className="flex-1 text-sm font-medium text-slate-800">
                        {sectionLabel(section.key)}
                      </span>
                      <button
                        onClick={() => patchSection(section.key, { visible: !section.visible })}
                        aria-pressed={section.visible}
                        aria-label={`${section.visible ? 'Hide' : 'Show'} ${sectionLabel(section.key)}`}
                        className={[
                          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          section.visible
                            ? 'bg-success-muted text-success'
                            : 'bg-slate-100 text-slate-500',
                        ].join(' ')}
                      >
                        {section.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                        {section.visible ? 'Shown' : 'Hidden'}
                      </button>
                    </div>

                    {label && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Input
                          aria-label={`${sectionLabel(section.key)} heading (English)`}
                          placeholder="Heading (EN)"
                          value={label.en}
                          onChange={(e) => setSectionLabel(section.key, 'en', e.target.value)}
                        />
                        <Input
                          aria-label={`${sectionLabel(section.key)} heading (Arabic)`}
                          placeholder="العنوان (AR)"
                          dir="rtl"
                          value={label.ar ?? ''}
                          onChange={(e) => setSectionLabel(section.key, 'ar', e.target.value)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Line-item columns */}
          {lineItemColumns.length > 0 && (
            <Card variant="bordered" className="p-5">
              <h2 className="font-semibold text-slate-900 mb-1">Line-item columns</h2>
              <p className="text-sm text-slate-500 mb-4">
                Show, hide, or rename the columns in the items table.
              </p>
              <ul className="space-y-3">
                {lineItemColumns.map((col) => (
                  <li key={col.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-sm font-medium text-slate-800">{col.label.en}</span>
                      <button
                        onClick={() => patchColumn(col.key, { visible: !col.visible })}
                        aria-pressed={col.visible}
                        aria-label={`${col.visible ? 'Hide' : 'Show'} ${col.label.en} column`}
                        className={[
                          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          col.visible ? 'bg-success-muted text-success' : 'bg-slate-100 text-slate-500',
                        ].join(' ')}
                      >
                        {col.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                        {col.visible ? 'Shown' : 'Hidden'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label={`${col.label.en} column label (English)`}
                        placeholder="Label (EN)"
                        value={col.label.en}
                        onChange={(e) => patchColumn(col.key, { labelEn: e.target.value })}
                      />
                      <Input
                        aria-label={`${col.label.en} column label (Arabic)`}
                        placeholder="التسمية (AR)"
                        dir="rtl"
                        value={col.label.ar ?? ''}
                        onChange={(e) => patchColumn(col.key, { labelAr: e.target.value })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Totals lines */}
          {totalsSection?.lines && (
            <Card variant="bordered" className="p-5">
              <h2 className="font-semibold text-slate-900 mb-1">Totals lines</h2>
              <p className="text-sm text-slate-500 mb-4">
                Choose which summary lines appear under the table.
              </p>
              <div className="space-y-2">
                {Object.entries(totalsSection.lines).map(([lineKey, on]) => (
                  <label
                    key={lineKey}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 cursor-pointer"
                  >
                    <span className="text-sm font-medium text-slate-800 capitalize">
                      {lineKey.replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setOverride((prev) => {
                          const sections = [...(prev.sections ?? [])];
                          let totals = sections.find((s) => s.key === 'totals');
                          if (!totals) {
                            totals = { key: 'totals', lines: {} };
                            sections.push(totals);
                          }
                          const tIdx = sections.findIndex((s) => s.key === 'totals');
                          sections[tIdx] = {
                            ...totals,
                            lines: { ...totals.lines, [lineKey]: e.target.checked },
                          };
                          return { ...prev, sections };
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT — live PDF preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card variant="bordered" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-medium text-slate-700">Live preview</span>
              {previewLoading && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Updating…
                </span>
              )}
            </div>
            <div className="relative h-[calc(100vh-14rem)] min-h-[480px] bg-slate-100">
              {previewError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-sm text-danger">{previewError}</p>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={`${DOC_TYPE_LABELS[docType]} preview`}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              )}
            </div>
          </Card>
          <p className="mt-3 text-xs text-slate-500">
            Preview uses sample data. PDFs stay in a neutral color scheme regardless of theme.
          </p>
        </div>
      </div>
    </div>
  );
};
