import React from 'react';
import { Select } from '../../../ui/Select';
import { ColorField, FieldGroup, NumberField, SegmentedControl, ToggleRow } from '../controls';
import { PDF_COLORS } from '../../../../lib/pdf/styles';
import type {
  AddressZone,
  DividerStyle,
  HeaderLayout,
  LogoPlacement,
} from '../../../../lib/pdf/templateConfig';
import type { StudioApi } from '../TemplateStudio';

const LAYOUTS: { value: HeaderLayout; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'boxed', label: 'Boxed' },
  { value: 'split', label: 'Split' },
  { value: 'spreadsheet', label: 'Spreadsheet' },
];

export const HeaderFooterTab: React.FC<{ api: StudioApi }> = ({ api }) => {
  const { resolved } = api;
  const header = resolved.header;
  const nudge = header?.dividerNudge;
  const pn = resolved.pageNumbers;
  const footer = resolved.footer;

  return (
    <div className="space-y-7">
      <FieldGroup title="Header layout" description="Pick a letterhead arrangement and place your logo.">
        <SegmentedControl<HeaderLayout>
          value={header?.layout ?? 'classic'}
          onChange={(v) => api.setHeader({ layout: v })}
          options={LAYOUTS}
          columns={3}
        />
        <div className="grid grid-cols-2 gap-3">
          <SegmentedControl<LogoPlacement>
            label="Logo placement"
            value={header?.logoPlacement ?? 'left'}
            onChange={(v) => api.setHeader({ logoPlacement: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
          <SegmentedControl<AddressZone>
            label="Address zone"
            value={header?.addressZone ?? 'right'}
            onChange={(v) => api.setHeader({ addressZone: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'hidden', label: 'Hidden' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Logo width"
            suffix="pt"
            value={header?.logoWidth ?? 130}
            min={30}
            max={260}
            onChange={(v) => api.setHeader({ logoWidth: v })}
          />
          <NumberField
            label="Logo height"
            suffix="pt, 0 = auto"
            value={header?.logoHeight ?? 0}
            min={0}
            max={200}
            onChange={(v) => api.setHeader({ logoHeight: v > 0 ? v : undefined })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Logo bottom margin"
            suffix="pt"
            value={header?.logoMarginBottom ?? 5}
            min={0}
            max={40}
            onChange={(v) => api.setHeader({ logoMarginBottom: v })}
          />
          <NumberField
            label="Logo max height"
            suffix="pt, 0 = none"
            value={header?.logoMaxHeight ?? 0}
            min={0}
            max={200}
            onChange={(v) => api.setHeader({ logoMaxHeight: v > 0 ? v : undefined })}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Divider" description="The rule under the letterhead.">
        <SegmentedControl<DividerStyle>
          value={header?.divider ?? 'thin'}
          onChange={(v) => api.setHeader({ divider: v })}
          options={[
            { value: 'thin', label: 'Thin' },
            { value: 'thick', label: 'Thick' },
            { value: 'none', label: 'None' },
          ]}
        />
        {header?.divider !== 'none' && (
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Vertical" suffix="±" value={nudge?.vertical ?? 0} onChange={(v) => api.setHeaderNudge({ vertical: v })} />
            <NumberField label="Start inset" value={nudge?.start ?? 0} min={0} onChange={(v) => api.setHeaderNudge({ start: v })} />
            <NumberField label="End inset" value={nudge?.end ?? 0} min={0} onChange={(v) => api.setHeaderNudge({ end: v })} />
          </div>
        )}
      </FieldGroup>

      <FieldGroup title="Page numbers" description="Show a numbered line in the page footer.">
        <ToggleRow
          label="Show page numbers"
          checked={pn?.enabled ?? false}
          onChange={(v) => api.setPageNumbers({ enabled: v })}
        />
        {pn?.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Position"
              value={pn?.position ?? 'right'}
              onChange={(e) => api.setPageNumbers({ position: e.target.value as 'left' | 'center' | 'right' })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <Select
              label="Format"
              value={pn?.format ?? 'Page {page} of {pages}'}
              onChange={(e) => api.setPageNumbers({ format: e.target.value })}
              options={[
                { value: 'Page {page} of {pages}', label: 'Page X of Y' },
                { value: '{page} / {pages}', label: 'X / Y' },
                { value: '{page}', label: 'X' },
              ]}
            />
          </div>
        )}
      </FieldGroup>

      <FieldGroup title="Footer" description="Override the footer text and styling (blank keeps the brand tagline).">
        <input
          type="text"
          value={footer?.customText ?? ''}
          placeholder="Custom footer text (blank = brand tagline + website)"
          onChange={(e) => api.setFooter({ customText: e.target.value || undefined })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Alignment"
            value={footer?.alignment ?? 'center'}
            onChange={(e) => api.setFooter({ alignment: e.target.value as 'left' | 'center' | 'right' })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
          <NumberField label="Font size" suffix="pt" value={footer?.fontSize ?? 8} min={5} max={14} onChange={(v) => api.setFooter({ fontSize: v })} />
        </div>
        <ColorField
          label="Footer text color"
          value={footer?.fontColor}
          neutral={PDF_COLORS.textMuted}
          onChange={(hex) => api.setFooter({ fontColor: hex })}
          againstLabel="on white"
        />
      </FieldGroup>

      <FieldGroup
        title="Stamp & signature"
        description="Place an uploaded company stamp and signature in the signature area. Upload the images in Settings → General."
      >
        <ToggleRow
          label="Show company stamp"
          checked={resolved.signatureImages?.stamp?.show ?? false}
          onChange={(v) => api.setStampOptions({ show: v })}
        />
        {resolved.signatureImages?.stamp?.show && (
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label="Stamp width"
              suffix="pt"
              value={resolved.signatureImages?.stamp?.width ?? 110}
              min={40}
              max={220}
              onChange={(v) => api.setStampOptions({ width: v })}
            />
            <SegmentedControl<'left' | 'center' | 'right'>
              label="Placement"
              value={resolved.signatureImages?.stamp?.placement ?? 'right'}
              onChange={(v) => api.setStampOptions({ placement: v })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <NumberField
              label="Opacity"
              value={resolved.signatureImages?.stamp?.opacity ?? 1}
              min={0.1}
              max={1}
              step={0.1}
              onChange={(v) => api.setStampOptions({ opacity: v })}
            />
          </div>
        )}
        <ToggleRow
          label="Show signature image"
          checked={resolved.signatureImages?.signature?.show ?? false}
          onChange={(v) => api.setSignatureOptions({ show: v })}
        />
        {resolved.signatureImages?.signature?.show && (
          <NumberField
            label="Signature width"
            suffix="pt"
            value={resolved.signatureImages?.signature?.width ?? 140}
            min={60}
            max={260}
            onChange={(v) => api.setSignatureOptions({ width: v })}
          />
        )}
      </FieldGroup>
    </div>
  );
};
