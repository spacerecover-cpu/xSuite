// Pure resolution of one effective country-config value across the jurisdiction
// cascade. Clones the feature_flags pattern (src/lib/features/resolveFeatures.ts)
// — injected registry + injected layers, dependency-free, unit-testable — with
// two upgrades that the feature resolver deliberately does NOT have:
//   1. Values are TYPED: validated on read via a per-key Zod schema.
//   2. Fail-loud: an UNREGISTERED key THROWS (resolveFeatures.ts:28 returns true
//      for unknown keys — the OPPOSITE bias, correct there because flags gate
//      visibility; wrong here because config feeds money/tax/legal output), and
//      a required key still at REQUIRED_SENTINEL THROWS.
import type { ZodType } from 'zod';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';

export type ConfigBag = Record<string, unknown>;

export type ConfigLayers = {
  global?: ConfigBag;
  region?: ConfigBag;
  country?: ConfigBag;
  legalEntity?: ConfigBag;
  tenant?: ConfigBag;
  businessUnit?: ConfigBag;
};

// least → most specific; later wins
const ORDER: (keyof ConfigLayers)[] = [
  'global',
  'region',
  'country',
  'legalEntity',
  'tenant',
  'businessUnit',
];

export interface ConfigKeyDef {
  key: string;
  schema: ZodType;
  /** NEVER a US fabrication for required keys → REQUIRED_SENTINEL. */
  codedDefault: unknown;
  required?: boolean;
}

export class CountryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CountryConfigError';
  }
}

export function resolveConfig<T>(
  registry: Record<string, ConfigKeyDef>,
  layers: ConfigLayers,
  key: string,
): T {
  const def = registry[key];
  if (!def) {
    throw new CountryConfigError(`Unregistered country-config key: ${key}`);
  }

  let value: unknown = def.codedDefault; // lowest precedence
  for (const layer of ORDER) {
    const bag = layers[layer];
    // most-specific non-null wins; a null/undefined value is transparent.
    if (bag && key in bag && bag[key] != null) {
      value = bag[key]; // clean assignment (NOT the comma-operator bug the spec §14 flagged)
    }
  }

  if (def.required && value === REQUIRED_SENTINEL) {
    throw new CountryConfigError(
      `Required country-config key '${key}' unresolved — country not configured (fail-loud, D2)`,
    );
  }

  const parsed = def.schema.safeParse(value);
  if (!parsed.success) {
    throw new CountryConfigError(`Invalid value for ${key}: ${parsed.error.message}`);
  }
  return parsed.data as T;
}
