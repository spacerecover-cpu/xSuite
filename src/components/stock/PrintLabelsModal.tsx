import React, { useId, useRef, useState } from 'react';
import { Printer, Download, X, Plus, Minus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
// pdf/fonts + StockLabelDocument are dynamic-imported inside handlePrint
// so this modal — mounted by StockListPage — doesn't drag pdfmake into
// the stock page's initial load.
import type { StockItemWithCategory } from '../../lib/stockService';

interface PrintLabelsModalProps {
  items: StockItemWithCategory[];
  onClose: () => void;
}

interface LabelConfig {
  showPrice: boolean;
  showBarcode: boolean;
  copies: number;
  locationName: string;
  companyName: string;
}

const DEFAULT_CONFIG: LabelConfig = {
  showPrice: true,
  showBarcode: true,
  copies: 1,
  locationName: '',
  companyName: '',
};

export const PrintLabelsModal: React.FC<PrintLabelsModalProps> = ({ items, onClose }) => {
  const toast = useToast();
  const companyFieldRef = useRef<HTMLInputElement>(null);
  const companyFieldId = useId();
  const locationFieldId = useId();
  const [config, setConfig] = useState<LabelConfig>(DEFAULT_CONFIG);
  const [isPrinting, setIsPrinting] = useState(false);

  const set = <K extends keyof LabelConfig>(key: K, value: LabelConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const handlePrint = async (download = false) => {
    if (items.length === 0) return;
    setIsPrinting(true);
    try {
      const [{ initializePDFFonts, createPdfWithFonts }, { buildStockLabelDocument }] = await Promise.all([
        import('../../lib/pdf/fonts'),
        import('../../lib/pdf/documents/StockLabelDocument'),
      ]);
      await initializePDFFonts();
      for (const item of items) {
        const docDef = buildStockLabelDocument({
          item,
          locationName: config.locationName || undefined,
          companyName: config.companyName || undefined,
          showPrice: config.showPrice,
          showBarcode: config.showBarcode,
          copies: config.copies,
        });
        const pdf = createPdfWithFonts(docDef);
        const filename = `label-${item.sku ?? item.name.replace(/\s+/g, '-')}.pdf`;
        if (download) {
          pdf.download(filename);
        } else {
          pdf.open();
        }
      }
    } catch (err) {
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
          <h4 className="text-sm font-semibold text-slate-700">Label Options</h4>

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
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showBarcode}
                onChange={(e) => set('showBarcode', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary"
              />
              Show Barcode/SKU
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Copies per Label</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => set('copies', Math.max(1, config.copies - 1))}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center font-semibold text-slate-800">{config.copies}</span>
              <button
                onClick={() => set('copies', Math.min(20, config.copies + 1))}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
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
            onClick={() => handlePrint(true)}
            disabled={isPrinting || items.length === 0}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="gap-1"
            onClick={() => handlePrint(false)}
            disabled={isPrinting || items.length === 0}
          >
            <Printer className="w-4 h-4" />
            {isPrinting ? 'Generating...' : 'Open & Print'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
