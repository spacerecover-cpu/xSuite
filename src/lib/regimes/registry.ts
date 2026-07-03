//
// In-code plugin registry (L3 routing). Keys are selected BY DATA (the regime.*
// Country Engine keys); resolution failure on a statutory_ready country is a
// hard CountryConfigError — structurally impossible to render a silent "VAT 0%".

import { CountryConfigError } from '../country/resolveCountryConfig';
import type {
  DocumentComplianceProfile, EInvoicingTransport, NumberingPolicy,
  PayrollPack, ReturnComposer, TaxStrategy,
} from './types';

export type RegimePluginKind = 'tax' | 'return' | 'numbering' | 'documents' | 'einvoice' | 'payroll';

interface RegisteredPlugin { key: string; version: string }

const registries: Record<RegimePluginKind, Map<string, RegisteredPlugin>> = {
  tax: new Map(), return: new Map(), numbering: new Map(),
  documents: new Map(), einvoice: new Map(), payroll: new Map(),
};

export function registerRegimePlugin(kind: RegimePluginKind, plugin: { key: string; version: string }): void {
  const existing = registries[kind].get(plugin.key);
  if (existing && existing !== plugin) {
    throw new Error(
      `Regime plugin already registered: kind=${kind} key=${plugin.key} ` +
      `(existing v${existing.version}, attempted v${plugin.version}). One key, one plugin.`,
    );
  }
  registries[kind].set(plugin.key, plugin);
}

function resolve<T extends RegisteredPlugin>(kind: RegimePluginKind, key: string): T {
  const plugin = registries[kind].get(key);
  if (!plugin) {
    throw new CountryConfigError(
      `No registered ${kind} regime plugin for key "${key}". ` +
      `A statutory_ready country must resolve every regime.* key to a registered, fixture-green plugin.`,
    );
  }
  return plugin as T;
}

export function resolveTaxStrategy(key: string): TaxStrategy { return resolve<TaxStrategy>('tax', key); }
export function resolveReturnComposer(key: string): ReturnComposer { return resolve<ReturnComposer>('return', key); }
export function resolveNumberingPolicy(key: string): NumberingPolicy { return resolve<NumberingPolicy>('numbering', key); }
export function resolveDocumentProfile(key: string): DocumentComplianceProfile { return resolve<DocumentComplianceProfile>('documents', key); }
export function resolveEInvoicingTransport(key: string): EInvoicingTransport { return resolve<EInvoicingTransport>('einvoice', key); }
export function resolvePayrollPack(key: string): PayrollPack { return resolve<PayrollPack>('payroll', key); }

/** Capability manifest input for the publish gate (graft 2). */
export function listRegisteredCapabilities(): Array<{ capability_key: string; kind: string; version: string }> {
  const out: Array<{ capability_key: string; kind: string; version: string }> = [];
  (Object.keys(registries) as RegimePluginKind[]).forEach((kind) => {
    registries[kind].forEach((p) => out.push({ capability_key: p.key, kind, version: p.version }));
  });
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.capability_key.localeCompare(b.capability_key));
}
