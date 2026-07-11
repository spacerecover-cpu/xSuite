/**
 * LabelStudio preview — render a live thermal-label PDF from representative
 * sample data for the given entity + design, returning a blob object-URL for an
 * `<iframe>`. It reuses the EXACT print path (mappers → resolveLabelImages →
 * buildCompactLabelDocument), so what the editor shows is byte-identical to what
 * Direct Print produces. The caller MUST `URL.revokeObjectURL` when swapping.
 */

import type { LabelEntity, LabelEntityConfig } from '../../labelPrefsService';
import type { InventoryItemWithDetails } from '../../inventory/inventoryLabelTypes';
import type { StockLabelItem } from './labelContent';
import { getLabelSize } from './labelSizes';
import { resolveLabelImages, buildLabelBlobUrl } from './labelPrintService';
import { caseLabelContents, stockLabelContent, inventoryLabelContent } from './labelContent';
import { sampleReceiptData } from '../engine/sampleData';

const SAMPLE_STOCK: StockLabelItem = {
  name: 'Samsung 870 EVO 500GB',
  sku: 'STK-0042',
  barcode: '8801643000000',
  brand: 'Samsung',
  stock_categories: { name: 'Internal SSD' },
};

const SAMPLE_INVENTORY: InventoryItemWithDetails = {
  id: 'inv-sample',
  item_number: 'INV-00013',
  name: 'Seagate Barracuda Donor',
  model: 'ST2000DM008',
  barcode: '4066512345678',
  qr_value: 'INV-00013',
  brand: { name: 'Seagate' },
  device_type: { name: 'HDD 3.5"' },
  capacity: { name: '2 TB' },
  storage_location: { name: 'Shelf B-12' },
};

/** Render one representative label for `entity` under `config`; returns a blob URL. */
export async function previewLabelBlob(entity: LabelEntity, config: LabelEntityConfig): Promise<string> {
  const size = getLabelSize(config.sizeId);
  const mapped =
    entity === 'case'
      ? caseLabelContents(sampleReceiptData(), size, config.fields).slice(0, 1)
      : entity === 'stock'
        ? [stockLabelContent(SAMPLE_STOCK, { priceText: '1,234.50', locationName: 'Shelf A-3', companyName: 'Space Data Recovery' }, config.fields)]
        : [inventoryLabelContent(SAMPLE_INVENTORY, config.fields)];

  const labels = await resolveLabelImages(mapped, size, {
    showQr: config.showQr,
    showBarcode: config.showBarcode,
  });
  return buildLabelBlobUrl(labels, size, 'Roboto');
}
