import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { Input } from '../../../ui/Input';
import { ColorField, FieldGroup, NumberField, SegmentedControl, ToggleRow } from '../controls';
import { PDF_COLORS } from '../../../../lib/pdf/styles';
import { generatePalette } from '../../../../lib/pdf/engine/palette';
import { resolveSecondary, secondaryText } from '../../../../lib/pdf/templateConfig';
import type {
  DensityPreset,
  DocRefStyle,
  InfoCardStyle,
  PaperConfig,
  PdfFontFamily,
  SignatureLineStyle,
  TableHeaderStyle,
  TermsLayoutStyle,
  TitleStyle,
  TypographyStyleKey,
} from '../../../../lib/pdf/templateConfig';
import { isRTLLanguage } from '../../../../lib/documentTranslations';
import { languageName } from '../languageOptions';
import type { StudioApi } from '../TemplateStudio';

const FONT_OPTIONS = [
  { value: 'Roboto', label: 'Roboto (Latin)' },
  { value: 'Tajawal', label: 'Tajawal (Arabic-ready)' },
  { value: 'NotoSansArabic', label: 'Noto Sans Arabic' },
];

const SIZE_KEYS: { key: TypographyStyleKey; label: string }[] = [
  { key: 'documentTitle', label: 'Document title' },
  { key: 'sectionTitle', label: 'Section titles' },
  { key: 'tableHeader', label: 'Table header' },
  { key: 'tableCell', label: 'Table cells' },
  { key: 'label', label: 'Field labels' },
  { key: 'value', label: 'Field values' },
  { key: 'totalValue', label: 'Grand total' },
  { key: 'termsText', label: 'Terms text' },
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
  const presentation = resolved.presentation;
  const seed = colors?.accent && colors.accent.startsWith('#') ? colors.accent : PDF_COLORS.primary;
  const secondary = resolveSecondary(resolved.language);
  const docTitle = resolved.labels?.documentTitle;

  return (
    <div className="space-y-7">
      <FieldGroup title="Document title" description="The heading printed at the top (e.g. TAX INVOICE).">
        <div className={`grid gap-2 ${secondary ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Input
            aria-label="Document title (English)"
            placeholder="e.g. TAX INVOICE"
            value={docTitle?.en ?? ''}
            onChange={(e) => api.setSectionLabel('documentTitle', 'en', e.target.value)}
          />
          {secondary && (
            <Input
              aria-label={`Document title (${languageName(secondary)})`}
              placeholder={`Title (${languageName(secondary)})`}
              dir={isRTLLanguage(secondary) ? 'rtl' : undefined}
              value={secondaryText(docTitle ?? {}, secondary) ?? ''}
              onChange={(e) => api.setSectionLabel('documentTitle', secondary, e.target.value)}
            />
          )}
        </div>
      </FieldGroup>

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
            min={0.6}
            max={2}
            step={0.05}
            onChange={(v) => api.setTypography({ baseScale: v })}
          />
        </div>
        <p className="text-xs text-slate-500">
          Font size scales the whole document (0.6×–2×). The per-section sizes below override the scaled default for
          one section — leave at 0 to follow the document size.
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
        title="Design style"
        description="The premium presentation finish. Classic keeps today's look; the premium options match the flagship gallery templates."
      >
        <SegmentedControl<InfoCardStyle>
          label="Info cards"
          columns={2}
          value={presentation?.infoCardStyle ?? 'band'}
          onChange={(v) => api.setPresentation({ infoCardStyle: v })}
          options={[
            { value: 'band', label: 'Filled band' },
            { value: 'open', label: 'Open (premium)' },
          ]}
        />
        <SegmentedControl<TableHeaderStyle>
          label="Table headers"
          columns={2}
          value={presentation?.tableHeaderStyle ?? 'filled'}
          onChange={(v) => api.setPresentation({ tableHeaderStyle: v })}
          options={[
            { value: 'filled', label: 'Filled' },
            { value: 'light', label: 'Light (premium)' },
          ]}
        />
        <SegmentedControl<TitleStyle>
          label="Document title"
          columns={2}
          value={presentation?.titleStyle ?? 'inline'}
          onChange={(v) => api.setPresentation({ titleStyle: v })}
          options={[
            { value: 'inline', label: 'Inline' },
            { value: 'display', label: 'Display (stacked)' },
          ]}
        />
        <SegmentedControl<DocRefStyle>
          label="Case / document ID banner"
          columns={3}
          value={presentation?.docRef ?? 'none'}
          onChange={(v) => api.setPresentation({ docRef: v })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'banner', label: 'Banner' },
            { value: 'pill', label: 'Pill' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <SegmentedControl<SignatureLineStyle>
            label="Signature rules"
            columns={2}
            value={presentation?.signatureStyle ?? 'solid'}
            onChange={(v) => api.setPresentation({ signatureStyle: v })}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dotted', label: 'Dotted' },
            ]}
          />
          <SegmentedControl<'left' | 'center'>
            label="Signature labels"
            columns={2}
            value={presentation?.signatureAlign ?? 'left'}
            onChange={(v) => api.setPresentation({ signatureAlign: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Centered' },
            ]}
          />
        </div>
        <SegmentedControl<TermsLayoutStyle>
          label="Terms & consent box"
          columns={2}
          value={presentation?.termsStyle ?? 'boxed'}
          onChange={(v) => api.setPresentation({ termsStyle: v })}
          options={[
            { value: 'boxed', label: 'Boxed' },
            { value: 'open', label: 'Open columns' },
          ]}
        />
        <ToggleRow
          label="Social icons in footer"
          description="Accent tagline plus Facebook / X / LinkedIn / Instagram glyphs from your online presence."
          checked={presentation?.footerSocialIcons ?? false}
          onChange={(v) => api.setPresentation({ footerSocialIcons: v })}
        />
        <ToggleRow
          label="Website in letterhead"
          description="Adds your website to the header identity block."
          checked={presentation?.headerWebsite ?? false}
          onChange={(v) => api.setPresentation({ headerWebsite: v })}
        />
        <ToggleRow
          label="Device icons in tables"
          description="Draws the device-type icon beside each device row."
          checked={presentation?.deviceIcons ?? false}
          onChange={(v) => api.setPresentation({ deviceIcons: v })}
        />
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
          <div className="grid grid-cols-3 gap-2">
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
            <NumberField
              label="Font size"
              suffix="pt"
              value={resolved.watermark?.fontSize ?? 60}
              min={12}
              max={160}
              onChange={(v) => api.setWatermark({ fontSize: v })}
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
