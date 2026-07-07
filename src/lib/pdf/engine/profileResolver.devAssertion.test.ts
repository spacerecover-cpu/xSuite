import { describe, it, expect } from 'vitest';
import { assertProfileResolved } from './profileResolver';
import { registerAllRegimePlugins } from '../../regimes/register';
import { resolveDocumentProfile } from '../../regimes/registry';

registerAllRegimePlugins();
const generic = resolveDocumentProfile('generic_invoice');
const inGst = resolveDocumentProfile('in_gst_invoice');

describe('assertProfileResolved (honest-degrade dev assertion)', () => {
  it('THROWS when a registered seller declared a non-generic profile that fell back to generic_invoice', () => {
    expect(() => assertProfileResolved('in_gst_invoice', generic, true))
      .toThrow(/in_gst_invoice.*generic_invoice/i);
  });
  it('does not throw when the declared profile actually resolved', () => {
    expect(() => assertProfileResolved('in_gst_invoice', inGst, true)).not.toThrow();
  });
  it('does not throw when the country genuinely declares generic_invoice', () => {
    expect(() => assertProfileResolved('generic_invoice', generic, true)).not.toThrow();
  });
  it('does not throw for an unregistered seller (no ceremony expected)', () => {
    expect(() => assertProfileResolved('in_gst_invoice', generic, false)).not.toThrow();
  });
});
