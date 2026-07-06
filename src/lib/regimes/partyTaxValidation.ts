// Party (buyer) tax-number validation dispatcher. Lives under src/lib/regimes/
// so country dispatch stays inside the regimes boundary (eslint
// no-country-branching-outside-regimes). Empty values are always ok — the
// master_document_requirements gate owns mandatoriness at issuance.
import { supabase } from '../supabaseClient';
import { validateGSTIN } from './in_gst/gstin';

export interface PartyTaxNumberCheck {
  ok: boolean;
  error: string | null;
}

export function validatePartyTaxNumberPure(args: {
  countryCode: string | null;
  taxNumber: string | null | undefined;
  subdivisionAuthorityCode: string | null;
}): PartyTaxNumberCheck {
  const value = args.taxNumber?.trim() ?? '';
  if (!value) return { ok: true, error: null };
  if (args.countryCode !== 'IN') return { ok: true, error: null };
  const check = validateGSTIN(value, { tax_authority_code: args.subdivisionAuthorityCode });
  return { ok: check.ok, error: check.error };
}

/** Service-layer chokepoint: resolves the country code and (when the party has
 *  a state selected) the subdivision's GST authority code, then applies the
 *  pure dispatcher. Throws Error(message) on failure so every mutation surface
 *  (modal, page form, script) gets the same rejection. */
export async function assertPartyTaxNumberValid(args: {
  countryId: string | null | undefined;
  subdivisionId: string | null | undefined;
  taxNumber: string | null | undefined;
}): Promise<void> {
  const value = args.taxNumber?.trim() ?? '';
  if (!value || !args.countryId) return;
  const { data: country, error } = await supabase
    .from('geo_countries').select('code').eq('id', args.countryId).maybeSingle();
  if (error) throw error;
  let authorityCode: string | null = null;
  if (args.subdivisionId) {
    const { data: sub, error: subErr } = await supabase
      .from('geo_subdivisions').select('tax_authority_code').eq('id', args.subdivisionId).maybeSingle();
    if (subErr) throw subErr;
    authorityCode = sub?.tax_authority_code ?? null;
  }
  const check = validatePartyTaxNumberPure({
    countryCode: country?.code ?? null, taxNumber: value, subdivisionAuthorityCode: authorityCode,
  });
  if (!check.ok) throw new Error(check.error ?? 'Invalid tax registration number.');
}
