import type { EInvoicingTransport } from '../types';

/** The default e-invoicing regime: no statutory artifact. buildArtifact refusing
 *  loudly (rather than emitting an empty payload) keeps einvoice_submissions
 *  honest — a row in that ledger must always be a real statutory artifact. */
export const noEinvoice: EInvoicingTransport = {
  key: 'no_einvoice',
  version: '1.0.0',
  regimeClass: 'render_artifact',
  buildArtifact(): never {
    throw new Error(
      'no_einvoice regime has no statutory artifact to build. ' +
      'Callers must check the resolved regime.einvoice key before invoking transports.',
    );
  },
};
