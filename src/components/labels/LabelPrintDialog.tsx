import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { settingsKeys } from '../../lib/queryKeys';
import {
  DEFAULT_LABEL_PRINTING_PREFS,
  getLabelPrintingPrefs,
  labelEntityConfig,
  type LabelEntity,
  type LabelEntityConfig,
} from '../../lib/labelPrefsService';
import { LabelPrintOptionsFields, type LabelPrintOverrides } from './LabelPrintOptionsFields';

interface LabelPrintDialogProps {
  entity: LabelEntity;
  isOpen: boolean;
  /** Disables the Print button while the caller is generating the PDF. */
  busy?: boolean;
  onClose: () => void;
  /** The one-off design for THIS print — pass it as `LabelPrintOptions.config`.
   *  The tenant's saved design is never touched. */
  onPrint: (config: LabelEntityConfig) => void;
}

/**
 * Print-time overrides: pick a different label stock, copies, or QR / barcode
 * visibility for a single print without changing the tenant design. Seeds from
 * the saved design each time it opens; hands the edited full config back to the
 * caller, which passes it straight into the existing print service plumbing.
 */
export const LabelPrintDialog: React.FC<LabelPrintDialogProps> = ({
  entity,
  isOpen,
  busy,
  onClose,
  onPrint,
}) => {
  const { data: prefs } = useQuery({
    queryKey: settingsKeys.labelPrinting(),
    queryFn: getLabelPrintingPrefs,
    enabled: isOpen,
  });
  const tenantConfig = labelEntityConfig(prefs ?? DEFAULT_LABEL_PRINTING_PREFS, entity);

  // Only the fields the user actually touched — overlaid on the live tenant
  // design, so a prefs load landing mid-edit updates untouched fields without
  // ever clobbering an edit. Cleared on close so nothing leaks between prints.
  const [edits, setEdits] = useState<Partial<LabelPrintOverrides>>({});
  useEffect(() => {
    if (!isOpen) setEdits({});
  }, [isOpen]);

  const value: LabelPrintOverrides = {
    sizeId: tenantConfig.sizeId,
    copies: tenantConfig.copies,
    showQr: tenantConfig.showQr,
    showBarcode: tenantConfig.showBarcode,
    ...edits,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print options"
      icon={Printer}
      size="sm"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" isLoading={busy} loadingLabel="Printing" onClick={() => onPrint({ ...tenantConfig, ...value })}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <LabelPrintOptionsFields value={value} onChange={(patch) => setEdits((e) => ({ ...e, ...patch }))} />
        <p className="text-xs text-slate-500">
          One-off — your saved design is unchanged.{' '}
          <Link to="/settings/labels" className="font-medium text-primary hover:underline">
            Edit design in Label Studio
          </Link>
        </p>
      </div>
    </Modal>
  );
};
