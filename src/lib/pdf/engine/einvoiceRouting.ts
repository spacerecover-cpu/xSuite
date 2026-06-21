/** D11 — ZATCA Phase-1 QR is a Saudi-VAT statutory artifact. It must be routed by
 *  the resolving entity's country + tax system, NEVER by a UI tax-bar toggle, so a
 *  non-KSA tenant cannot emit a "compliant" KSA QR. (master_einvoice_regimes registry
 *  is the Phase-3 generalization; this is the immediate routing fix.) */
export function shouldEmitZatcaQr(args: { taxSystem: string | null | undefined; countryCode: string | null | undefined }): boolean {
  return args.taxSystem === 'VAT' && args.countryCode === 'SA';
}
