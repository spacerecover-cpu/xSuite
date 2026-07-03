// src/pages/settings/SystemNumbers.test.tsx
import { describe, it, expect } from 'vitest';
import { SCOPE_REGISTRY } from './SystemNumbers';

describe('SystemNumbers scope registry', () => {
  it('contains every real get_next_number caller scope and no phantoms', () => {
    const keys = SCOPE_REGISTRY.map((s) => s.key);
    // Real scopes: live number_sequences rows ∪ src/lib RPC callers (verified 2026-07-02)
    for (const real of ['case', 'companies', 'customers', 'invoices', 'proforma_invoices', 'quote',
      'payment', 'expense', 'stock', 'stock_adjustment', 'purchase_orders', 'suppliers',
      'report_evaluation', 'report_service', 'payroll_bank_file']) {
      expect(keys).toContain(real);
    }
    // Phantom keys from the old SEQUENCE_CONFIG must be gone:
    for (const phantom of ['customer', 'company', 'supplier', 'purchase_order', 'invoice', 'user', 'document']) {
      expect(keys).not.toContain(phantom);
    }
  });
});
