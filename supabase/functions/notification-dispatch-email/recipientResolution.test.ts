import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// index.ts is a Deno entrypoint (jsr:/npm: specifiers, top-level Deno.serve) so it
// cannot be imported here. The regression this guards is statically checkable: the
// function runs under the service role (RLS bypassed), so every table read must
// carry its own soft-delete filter. Without it, a recipient lookup resolved
// archived customers and mailed them.
const here = fileURLToPath(new URL('.', import.meta.url));
const source = readFileSync(`${here}index.ts`, 'utf8');

function queryChain(table: string): string {
  const start = source.indexOf(`.from("${table}")`);
  if (start === -1) throw new Error(`No .from("${table}") found in index.ts`);
  const end = source.indexOf(';', start);
  return source.slice(start, end);
}

describe('notification-dispatch-email soft-delete filters', () => {
  it('resolves portal-customer recipients only from live customers_enhanced rows', () => {
    expect(queryChain('customers_enhanced')).toContain('.is("deleted_at", null)');
  });

  it('keeps the soft-delete filter on the subscription lookup', () => {
    expect(queryChain('notification_subscriptions')).toContain('.is("deleted_at", null)');
  });
});
