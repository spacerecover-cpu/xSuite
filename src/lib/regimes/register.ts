//
// The ONE registration entry point. Import this (not individual plugins) from
// services, the publish gate, and the CI fixture job so the registry is always
// fully populated before any resolve* call.

import { registerRegimePlugin } from './registry';
import { simpleVat } from './simple_vat';
import { prefixNumbering } from './prefix_numbering';
import { genericInvoice } from './generic_invoice';
import { gccTaxInvoiceProfile } from './gcc_tax_invoice';
import { noEinvoice } from './no_einvoice';
import { zatcaPh1Transport } from './zatca_ph1';
import { gccReturnComposer } from './gcc_return';

let registered = false;

export function registerAllRegimePlugins(): void {
  if (registered) return;
  registerRegimePlugin('tax', simpleVat);
  registerRegimePlugin('numbering', prefixNumbering);
  registerRegimePlugin('documents', genericInvoice);
  registerRegimePlugin('documents', gccTaxInvoiceProfile);
  registerRegimePlugin('einvoice', noEinvoice);
  registerRegimePlugin('einvoice', zatcaPh1Transport);
  registerRegimePlugin('return', gccReturnComposer);
  registered = true;
}
