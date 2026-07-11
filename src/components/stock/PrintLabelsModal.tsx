import React, { useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Download, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { useCurrencyConfig } from '../../contexts/TenantConfigContext';
import { formatCurrencyWithConfig } from '../../lib/format';
import { settingsKeys } from '../../lib/queryKeys';
import {
  DEFAULT_LABEL_PRINTING_PREFS,
  getLabelPrintingPrefs,
  labelEntityConfig,
} from '../../lib/labelPrefsService';
import {
  LabelPrintOptionsFields,
  type LabelPrintOverrides,
} from '../labels/LabelPrintOptionsFields';
// labelPrintService (and pdfmake behind it) is dynamic-imported inside
// handlePrint so this modal — mounted by StockListPage — doesn't drag pdfmake
// into the stock page's initial load.
import type { StockItemWithCategory } from '../../lib/stockService';

interface PrintLabelsModalProps {
  items: StockItemWithCategory[];
  onClose: () => void;
}

interface LabelConfig {
  showPrice: boolean;
  locationName: string;
  companyName: string;
}

const DEFAULT_CONFIG: LabelConfig = {
  showPrice: true,
  locationName: '',
  companyName: '',
};

export const PrintLabelsModal: React.FC<PrintLabelsModalProps> = ({ items, onClose }) => {
  const toast = useToast();
  const currency = useCurrencyConfig();
  const companyFieldRef = useRef<HTMLInputElement>(null);
  const companyFieldId = useId();
  const locationFieldId = useId();
  const [config, setConfig] = useState<LabelConfig>(DEFAULT_CONFIG);
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: labelPrefs } = useQuery({
    queryKey: settingsKeys.labelPrinting(),
    queryFn: getLabelPrintingPrefs,
  });
  const tenantConfig = labelEntityConfig(labelPrefs ?? DEFAULT_LABEL_PRINTING_PREFS, 'stock');

  // One-off design edits for THIS batch — overlaid on the tenant design, never saved.
  const [edits, setEdits] = useState<Partial<LabelPrintOverrides>>({});
  const design: LabelPrintOverrides = {
    sizeId: tenantConfig.sizeId,
    copies: tenantConfig.copies,
    showQr: tenantConfig.showQr,
    showBarcode: tenantConfig.showBarcode,
    ...edits,
  };

  const set = <K extends keyof LabelConfig>(key: K, value: LabelConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const handlePrint = async (output: 'print' | 'download') => {
    if (items.length === 0) return;
    setIsPrinting(true);
    try {
      const { printStockLabelBatch } = await import('../../lib/pdf/labels/labelPrintService');
      const entries = items.map((item) => ({
        item,
        priceText:
          config.showPrice && item.selling_price != null
            ? formatCurrencyWithConfig(item.selling_price, currency)
            : null,
      }));
      const result = await printStockLabelBatch(entries, {
        output,
        config: { ...tenantConfig, ...design },
        locationName: config.locationName || undefined,
        companyName: config.companyName || undefined,
      });
      if (!result.success) {
        toast.error(result.error || 'Failed to generate label PDF');
      }
    } catch {
      toast.error('Failed to generate label PDF');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Print Stock Labels" size="md" initialFocusRef={companyFieldRef}>
      <div className="space-y-5">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">
            Printing labels for <span className="font-semibold text-slate-800">{items.length}</span> item{items.length !== 1 ? 's' : ''}
          </p>
          {items.length <= 5 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {items.map((item) => (
                <span key={item.id} className="text-xs bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                  {item.name}
                  {item.sku && <span className="text-slate-400 ml-1">({item.sku})</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700">This print</h4>
          <LabelPrintOptionsFields
            value={design}
            onChange={(patch) => setEdits((e) => ({ ...e, ...patch }))}
            idPrefix="stock-print"
          />
          <p className="text-xs text-slate-500">
            One-off — your saved stock-label design is unchanged. The page is sized exactly to the
            label; print at 100% scale.
          </p>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700">Label content</h4>

          <div>
            <label htmlFor={companyFieldId} className="block text-xs font-medium text-slate-600 mb-1">Company Name</label>
            <input
              ref={companyFieldRef}
              id={companyFieldId}
              type="text"
              value={config.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Your company name (optional)"
            />
          </div>

          <div>
            <label htmlFor={locationFieldId} className="block text-xs font-medium text-slate-600 mb-1">Location</label>
            <input
              id={locationFieldId}
              type="text"
              value={config.locationName}
              onChange={(e) => set('locationName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Storage location (optional)"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showPrice}
                onChange={(e) => set('showPrice', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary"
              />
              Show Price
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={() => handlePrint('download')}
            disabled={isPrinting || items.length === 0}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="gap-1"
            onClick={() => handlePrint('print')}
            disabled={isPrinting || items.length === 0}
          >
            <Printer className="w-4 h-4" />
            {isPrinting ? 'Generating…' : 'Print'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
