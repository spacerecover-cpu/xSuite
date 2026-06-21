import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { ColorField, FieldGroup, NumberField, SegmentedControl, ToggleRow } from '../controls';
import { PDF_COLORS } from '../../../../lib/pdf/styles';
import { generatePalette } from '../../../../lib/pdf/engine/palette';
import type { DensityPreset, PaperConfig, PdfFontFamily } from '../../../../lib/pdf/templateConfig';
import type { StudioApi } from '../TemplateStudio';

const FONT_OPTIONS = [
  { value: 'Roboto', label: 'Roboto (Latin)' },
  { value: 'Tajawal', label: 'Tajawal (Arabic-ready)' },
  { value: 'NotoSansArabic', label: 'Noto Sans Arabic' },
];

const SIZE_KEYS: { key: 'documentTitle' | 'sectionTitle' | 'tableHeader' | 'tableCell'; label: string }[] = [
  { key: 'documentTitle', label: 'Document title' },
  { key: 'sectionTitle', label: 'Section titles' },
  { key: 'tableHeader', label: 'Table header' },
  { key: 'tableCell', label: 'Table cells' },
];

// Document font-size presets → base scale (1.0 = the native, dense sizes).
const SCALE_PRESETS: Record<string, number> = { compact: 1.0, standard: 1.2, large: 1.4, xlarge: 1.6 };
const SCALE_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra Large' },
];
/** The preset whose scale is closest to the current value (for highlighting). */
function nearestScalePreset(scale: number): string {
  let best = 'standard';
  let bestDiff = Infinity;
  for (const key of Object.keys(SCALE_PRESETS)) {
    const diff = Math.abs(SCALE_PRESETS[key] - scale);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = key;
    }
  }
  return best;
}

export const GeneralTab: React.FC<{ api: StudioApi }> = ({ api }) => {
  const { resolved } = api;
  const colors = resolved.colors;
  const typo = resolved.typography;
  const fitting = resolved.pageFitting;
  const seed = colors?.accent && colors.accent.startsWith('#') ? colors.accent : PDF_COLORS.primary;

  return (
    <div className="space-y-7">
      <FieldGroup title="Page" description="Sheet size, orientation, and margins.">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Paper size"
            value={resolved.paper.size}
            onChange={(e) => api.setPaper({ size: e.target.value as PaperConfig['size'] })}
            options={[
              { value: 'A4', label: 'A4' },
              { value: 'Letter', label: 'Letter' },
            ]}
          />
          <Select
            label="Orientation"
            value={resolved.paper.orientation}
            onChange={(e) => api.setPaper({ orientation: e.target.value as PaperConfig['orientation'] })}
            options={[
              { value: 'portrait', label: 'Portrait' },
              { value: 'landscape', label: 'Landscape' },
            ]}
          />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((side, i) => (
            <NumberField
              key={side}
              label={side[0].toUpperCase() + side.slice(1)}
              value={resolved.paper.margins[i]}
              min={0}
              onChange={(v) => {
                const next = [...resolved.paper.margins] as PaperConfig['margins'];
                next[i] = v;
                api.setPaper({ margins: next });
              }}
            />
          ))}
        </div>
      </FieldGroup>

      <FieldGroup title="Typography" description="Font family and document font size; fine-tune per section if needed.">
        <Select
          label="Font"
          value={typo?.fontFamily ?? 'Roboto'}
          onChange={(e) => api.setTypography({ fontFamily: e.target.value as PdfFontFamily })}
          options={FONT_OPTIONS}
        />
        <SegmentedControl
          label="Font size"
          columns={4}
          value={nearestScalePreset(typo?.baseScale ?? 1.2)}
          onChange={(v) => api.setTypography({ baseScale: SCALE_PRESETS[v] })}
          options={SCALE_PRESET_OPTIONS}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Fine-tune scale"
            value={typo?.baseScale ?? 1.2}
            min={0.8}
            max={1.75}
            step={0.05}
            onChange={(v) => api.setTypography({ baseScale: v })}
          />
        </div>
        <p className="text-xs text-slate-500">
          Font size scales the whole document. The per-section sizes below override the scaled default for one section
          — leave at 0 to follow the document size.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SIZE_KEYS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              suffix="pt"
              value={typo?.sizes?.[key] ?? 0}
              min={0}
              max={40}
              onChange={(v) => api.setTypographySize(key, v > 0 ? v : undefined)}
            />
          ))}
        </div>
      </FieldGroup>

      <FieldGroup
        title="Colors"
        description="Opt into brand colors. PDFs stay neutral by default; the badges check WCAG contrast."
      >
        <Button variant="secondary" size="sm" onClick={() => api.setColorsAll(generatePalette(seed))}>
          <Sparkles className="mr-2 h-4 w-4" />
          Smart palette from accent
        </Button>
        <div className="space-y-3">
          <ColorField
            label="Accent"
            value={colors?.accent}
            neutral={PDF_COLORS.primary}
            onChange={(hex) => api.setColors({ accent: hex })}
            againstLabel="on white"
          />
          <ColorField
            label="Body text"
            value={colors?.text}
            neutral={PDF_COLORS.text}
            onChange={(hex) => api.setColors({ text: hex })}
            againstLabel="on white"
          />
          <ColorField
            label="Muted label"
            value={colors?.label}
            neutral={PDF_COLORS.textLight}
            onChange={(hex) => api.setColors({ label: hex })}
            againstLabel="on white"
          />
          <ColorField
            label="Header background"
            value={colors?.headerBackground}
            neutral={PDF_COLORS.headerBg}
            onChange={(hex) => api.setColors({ headerBackground: hex })}
            against={colors?.text ?? PDF_COLORS.text}
            againstLabel="vs text"
          />
        </div>
        {colors && (
          <Button variant="ghost" size="sm" onClick={() => api.setColorsAll(undefined)}>
            Clear all colors (back to neutral)
          </Button>
        )}
      </FieldGroup>

      <FieldGroup title="Watermark" description="A diagonal background wash on every page.">
        <input
          type="text"
          value={resolved.watermark?.text ?? ''}
          placeholder="e.g. DRAFT, CONFIDENTIAL (blank for none)"
          onChange={(e) => api.setWatermark({ text: e.target.value || undefined })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {resolved.watermark?.text && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Angle"
              suffix="°"
              value={resolved.watermark?.angle ?? -45}
              min={-90}
              max={90}
              onChange={(v) => api.setWatermark({ angle: v })}
            />
            <NumberField
              label="Opacity"
              value={resolved.watermark?.opacity ?? 0.3}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => api.setWatermark({ opacity: v })}
            />
          </div>
        )}
      </FieldGroup>

      <FieldGroup title="Page fitting" description="Tune density, or auto-scale to keep the document on one page.">
        <SegmentedControl<DensityPreset>
          label="Density"
          value={fitting?.density ?? 'comfortable'}
          onChange={(v) => api.setPageFitting({ density: v })}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
            { value: 'dense', label: 'Dense' },
          ]}
        />
        <ToggleRow
          label="Auto-fit to one page"
          description="Scale spacing and fonts down (never below the legibility floor) to avoid a second page."
          checked={fitting?.autoFitOnePage ?? false}
          onChange={(v) => api.setPageFitting({ autoFitOnePage: v })}
        />
      </FieldGroup>
    </div>
  );
};
