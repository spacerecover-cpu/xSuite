import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// index.ts is a Deno entrypoint (jsr:/npm: specifiers, top-level Deno.serve) so it
// cannot be imported here. The regression this guards is a column-name typo, which
// is statically checkable: every column the tenants query selects must exist on the
// generated `tenants` Row type. `contact_email` did not, so the lookup errored and
// every PayPal subscription creation failed.
const here = fileURLToPath(new URL('.', import.meta.url));
const source = readFileSync(`${here}index.ts`, 'utf8');
const databaseTypes = readFileSync(`${here}../../../src/types/database.types.ts`, 'utf8');

function rowColumns(table: string): Set<string> {
  const tableStart = databaseTypes.indexOf(`      ${table}: {`);
  const rowStart = databaseTypes.indexOf('Row: {', tableStart);
  const rowEnd = databaseTypes.indexOf('Insert: {', rowStart);
  const body = databaseTypes.slice(rowStart, rowEnd);
  return new Set([...body.matchAll(/^ {10}(\w+):/gm)].map((m) => m[1]));
}

function selectedColumns(table: string): string[] {
  const match = source.match(new RegExp(`\\.from\\("${table}"\\)\\s*\\.select\\("([^"]+)"\\)`));
  if (!match) throw new Error(`No .from("${table}").select(...) found in index.ts`);
  return match[1].split(',').map((c) => c.trim()).filter(Boolean);
}

describe('paypal-create-subscription column contract', () => {
  it('selects only real tenants columns', () => {
    const columns = rowColumns('tenants');
    expect(columns.size).toBeGreaterThan(0);
    for (const selected of selectedColumns('tenants')) {
      expect(columns, `tenants.${selected} does not exist`).toContain(selected);
    }
  });

  it('selects only real profiles columns', () => {
    const columns = rowColumns('profiles');
    expect(columns.size).toBeGreaterThan(0);
    for (const selected of selectedColumns('profiles')) {
      expect(columns, `profiles.${selected} does not exist`).toContain(selected);
    }
  });

  it('sources the PayPal subscriber email from the profile, not a tenants column', () => {
    expect(source).not.toContain('contact_email');
    expect(source).toContain('email_address: subscriberEmail');
  });
});
