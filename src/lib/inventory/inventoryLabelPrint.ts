/**
 * printInventoryLabel — Inventory V2 P7, rebuilt on the compact label engine.
 *
 * Labels are printed on real adhesive label stock (tenant-selected size,
 * default 26×15mm Niimbot) with a scannable QR — and a Code128 strip on wide
 * stock — via src/lib/pdf/labels/labelPrintService.
 *
 * The heavy pdf/barcode dependencies are dynamically imported inside the
 * service, so this module still adds nothing to the page's initial load.
 */

import type { InventoryItemWithDetails } from './inventoryLabelTypes';
export type { InventoryItemWithDetails };

/** Direct-print the inventory label (browser print dialog, label pre-loaded). */
export async function printInventoryLabel(item: InventoryItemWithDetails): Promise<void> {
  const { printInventoryLabels } = await import('../pdf/labels/labelPrintService');
  await printInventoryLabels([item], { output: 'print' });
}

/** Download the inventory label PDF. */
export async function downloadInventoryLabel(item: InventoryItemWithDetails): Promise<void> {
  const { printInventoryLabels } = await import('../pdf/labels/labelPrintService');
  await printInventoryLabels([item], { output: 'download' });
}
