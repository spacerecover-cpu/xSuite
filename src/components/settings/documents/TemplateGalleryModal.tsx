import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { logger } from '../../../lib/logger';
import { PDF_COLORS } from '../../../lib/pdf/styles';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../../../lib/pdf/templateConfig';
import type { TemplateConfigOverride, TemplateDocumentType } from '../../../lib/pdf/templateConfig';
import { DOC_TYPE_LABELS } from '../../../pages/settings/documentTypeMeta';
import {
  PRESET_CATEGORY_LABELS,
  TEMPLATE_PRESETS,
  categoriesFor,
  type PresetCategory,
  type TemplatePreset,
} from '../../../pages/settings/presetTemplates';

interface TemplateGalleryModalProps {
  isOpen: boolean;
  docType: TemplateDocumentType;
  onClose: () => void;
  onUse: (config: TemplateConfigOverride) => void;
  onBlank: () => void;
}

/** A lightweight CSS skeleton that conveys a preset's layout + colors instantly. */
const PresetThumbnail: React.FC<{ preset: TemplatePreset }> = ({ preset }) => {
  const accent = preset.config.colors?.accent ?? PDF_COLORS.primary;
  const headerBg = preset.config.colors?.headerBackground ?? PDF_COLORS.headerBg;
  const hint = preset.thumbnailHint;
  const centered = hint === 'modern' || hint === 'boxed';
  const logo = <div className="h-4 w-8 rounded-sm" style={{ backgroundColor: accent }} />;
  const lines = (
    <div className="space-y-1">
      <div className="h-1.5 w-16 rounded-full bg-slate-200" />
      <div className="h-1.5 w-12 rounded-full bg-slate-200" />
    </div>
  );
  return (
    <div className="pointer-events-none flex h-36 flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      {/* Letterhead */}
      <div
        className={[
          'flex items-start gap-2',
          centered ? 'flex-col items-center text-center' : hint === 'split' ? 'justify-between' : '',
          hint === 'boxed' ? 'rounded border border-slate-200 p-1.5' : '',
        ].join(' ')}
      >
        {hint !== 'minimal' && logo}
        {!centered && lines}
        {centered && lines}
      </div>
      <div className="h-0.5 w-full rounded-full" style={{ backgroundColor: accent, opacity: preset.config.header?.divider === 'thick' ? 1 : 0.5 }} />
      {/* Title */}
      <div className="h-2 w-20 rounded-full" style={{ backgroundColor: accent }} />
      {/* Table */}
      <div className="mt-1 overflow-hidden rounded border border-slate-200">
        <div className="h-3 w-full" style={{ backgroundColor: headerBg }} />
        {[0, 1, 2].map((r) => (
          <div key={r} className="flex h-3 items-center gap-2 border-t border-slate-100 px-1" style={{ backgroundColor: preset.config.table?.zebra && r % 2 === 1 ? '#f8fafc' : 'transparent' }}>
            <div className="h-1 flex-1 rounded-full bg-slate-200" />
            <div className="h-1 w-6 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const TemplateGalleryModal: React.FC<TemplateGalleryModalProps> = ({
  isOpen,
  docType,
  onClose,
  onUse,
  onBlank,
}) => {
  const presets = TEMPLATE_PRESETS[docType] ?? [];
  const categories = useMemo(() => categoriesFor(docType), [docType]);
  const [category, setCategory] = useState<PresetCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const lastUrlRef = useRef<string | null>(null);

  const filtered = category === 'all' ? presets : presets.filter((p) => p.category === category);
  const selected = presets.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setShowPreview(false);
    }
  }, [isOpen]);

  useEffect(() => () => {
    if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
  }, []);

  const runPreview = async (preset: TemplatePreset) => {
    setShowPreview(true);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const [{ preloadAllFonts }, { previewTemplate }] = await Promise.all([
        import('../../../lib/pdf/fonts'),
        import('../../../lib/pdf/engine/previewTemplate'),
      ]);
      await preloadAllFonts();
      const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS[docType], undefined, preset.config);
      const { url } = await previewTemplate(docType, config);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      logger.error('[TemplateGallery] preview failed:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" maxWidth="6xl" title="Choose a template" icon={FileText}>
      {showPreview ? (
        <div className="flex h-[70vh] flex-col">
          <button onClick={() => setShowPreview(false)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to gallery
          </button>
          <div className="relative flex-1 overflow-hidden rounded-lg bg-slate-100">
            {previewLoading || !previewUrl ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <iframe
                src={`${previewUrl}#toolbar=0&navpanes=0&statusbar=0&view=FitH`}
                title="Template preview"
                className="h-full w-full border-0"
              />
            )}
          </div>
          {selected && (
            <div className="mt-3 flex justify-end">
              <Button onClick={() => onUse(selected.config)}>Use this template</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-[70vh] flex-col">
          <p className="mb-3 text-sm text-slate-600">
            Previews show a sample {DOC_TYPE_LABELS[docType].toLowerCase()} with your organization details. Pick a design, then customize it.
          </p>

          {/* Category tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
            {(['all', ...categories] as const).map((c) => {
              const active = c === category;
              const label = c === 'all' ? `All (${presets.length})` : PRESET_CATEGORY_LABELS[c];
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  aria-pressed={active}
                  className={[
                    'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Cards */}
          <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto pr-1 lg:grid-cols-3">
            {filtered.map((preset) => {
              const active = preset.id === selectedId;
              return (
                <button
                  key={preset.id}
                  onClick={() => setSelectedId(preset.id)}
                  onDoubleClick={() => runPreview(preset)}
                  className={[
                    'flex flex-col rounded-xl border p-3 text-left transition-all',
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
                  ].join(' ')}
                >
                  <PresetThumbnail preset={preset} />
                  <div className="mt-2.5 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{preset.name}</h3>
                    <Badge variant={preset.category === 'vip' ? 'success' : 'default'} size="sm">
                      {PRESET_CATEGORY_LABELS[preset.category]}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{preset.description}</p>
                  <p className="mt-1.5 text-xs font-medium text-slate-400">{preset.fontLabel}</p>
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
            <Button variant="ghost" size="sm" onClick={onBlank}>
              Skip — start blank
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={!selected} onClick={() => selected && runPreview(selected)}>
                Preview
              </Button>
              <Button size="sm" disabled={!selected} onClick={() => selected && onUse(selected.config)}>
                Use this template
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
