// src/lib/regimes/in_gst/registrationStatus.ts
// D6: the GST registration status must be EXPLICIT. 'registered' is evidenced
// by an active legal_entity_tax_registrations row; 'unregistered' by the
// tenant-visible declared flag. Deriving 'unregistered' from mere absence is a
// SILENT FALLBACK: dev assertion failure (throw under import.meta.env.DEV),
// loud logger.error in production while the computation degrades honestly to
// unregistered. India-only logic lives in this module so the eslint
// no-country-branching-outside-regimes rule holds at every call site.
import { logger } from '../../logger';
import type { LegalEntityTaxRegistrationRow } from '../types';

export type GstRegistrationStatus = 'registered' | 'unregistered';

export interface RegistrationStatusResolution {
  status: GstRegistrationStatus;
  source: 'registration_row' | 'declared_unregistered' | 'silent_fallback';
  assertionMessage: string | null;
}

export function regimeRequiresExplicitRegistrationStatus(regimeTaxKey: string): boolean {
  return regimeTaxKey === 'in_gst';
}

export function filterActiveRegistrations(
  registrations: LegalEntityTaxRegistrationRow[],
  onDate: string,
): LegalEntityTaxRegistrationRow[] {
  return registrations.filter(
    (r) => r.registered_from <= onDate && (r.registered_to === null || r.registered_to >= onDate),
  );
}

export function resolveGstRegistrationStatus(input: {
  regimeTaxKey: string;
  activeRegistrations: LegalEntityTaxRegistrationRow[];
  declaredStatus: 'registered' | 'unregistered' | undefined;
}): RegistrationStatusResolution {
  if (input.activeRegistrations.length > 0) {
    return { status: 'registered', source: 'registration_row', assertionMessage: null };
  }
  if (input.declaredStatus === 'unregistered') {
    return { status: 'unregistered', source: 'declared_unregistered', assertionMessage: null };
  }
  if (!regimeRequiresExplicitRegistrationStatus(input.regimeTaxKey)) {
    return { status: 'unregistered', source: 'declared_unregistered', assertionMessage: null };
  }
  return {
    status: 'unregistered',
    source: 'silent_fallback',
    assertionMessage:
      'GST tenant has no active tax registration and no declared "unregistered" status. ' +
      'Set the registration status in Settings → Tax Registration (D6: a silent unregistered fallback is forbidden).',
  };
}

export function assertNoSilentUnregisteredFallback(resolution: RegistrationStatusResolution): void {
  if (resolution.source !== 'silent_fallback' || !resolution.assertionMessage) return;
  logger.error(`[dev-assert] ${resolution.assertionMessage}`);
  if (import.meta.env.DEV) throw new Error(`[dev-assert] ${resolution.assertionMessage}`);
}

/** 2-digit GSTIN state prefix vs the subdivision's GST code. A subdivision with
 *  no tax_authority_code (e.g. code 96/97 place-of-supply-only rows) never mismatches. */
export function gstinMatchesSubdivision(
  gstin: string,
  taxAuthorityCode: string | null | undefined,
): boolean {
  if (!taxAuthorityCode) return true;
  return gstin.trim().slice(0, 2) === taxAuthorityCode;
}
