/**
 * Presentation metadata for the Settings → Label Studio surface.
 *
 * Unlike document templates, labels are NOT config-engine documents — each
 * card opens the dedicated `LabelStudio`, is keyed by its {@link LabelEntity},
 * edits `company_settings.metadata.label_printing`, and is printed by the
 * compact thermal engine. Pure data — no React, no DB.
 */

import type { LucideIcon } from 'lucide-react';
import { Tag, Barcode, Package } from 'lucide-react';
import type { LabelEntity } from '../../lib/labelPrefsService';

/** Metadata for one thermal-label card. */
export interface LabelCardMeta {
  entity: LabelEntity;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** The three thermal-label cards shown in the Label Studio. */
export const LABEL_CARDS: LabelCardMeta[] = [
  {
    entity: 'case',
    label: 'Case label',
    description: 'Thermal label for a case — one per tracked device, with QR.',
    icon: Tag,
  },
  {
    entity: 'stock',
    label: 'Stock label',
    description: 'Thermal label for a stock item — SKU, price and barcode.',
    icon: Barcode,
  },
  {
    entity: 'inventory',
    label: 'Inventory label',
    description: 'Thermal label for an inventory / donor item — spec, location, QR.',
    icon: Package,
  },
];
