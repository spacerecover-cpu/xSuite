import { describe, it, expect } from 'vitest';
import {
  getPaymentSummary,
  getInvoiceEditability,
  canRecordPayment,
  canIssueInvoice,
  canDeleteInvoice,
  canCreditInvoice,
  RESTRICTED_EDITABLE_FIELDS,
  type InvoiceFinancials,
} from './invoicePermissions';

const base: InvoiceFinancials = { invoice_type: 'tax_invoice', total_amount: 100, amount_paid: 0, balance_due: 100 };

describe('getPaymentSummary', () => {
  it('reports an unpaid invoice', () => {
    const s = getPaymentSummary({ ...base });
    expect(s).toMatchObject({ total: 100, paid: 0, balance: 100, progress: 0, settlement: 'unpaid', isOverdue: false });
  });

  it('reports a partial invoice with progress', () => {
    const s = getPaymentSummary({ ...base, amount_paid: 40, balance_due: 60, status: 'partial', payment_status: 'partial' });
    expect(s).toMatchObject({ paid: 40, balance: 60, progress: 0.4, settlement: 'partial' });
  });

  it('reports a fully paid invoice', () => {
    const s = getPaymentSummary({ ...base, amount_paid: 100, balance_due: 0, status: 'paid', payment_status: 'paid' });
    expect(s).toMatchObject({ balance: 0, progress: 1, settlement: 'paid' });
  });

  it('derives settlement from amounts when payment_status is absent', () => {
    expect(getPaymentSummary({ ...base, amount_paid: 50, balance_due: 50 }).settlement).toBe('partial');
    expect(getPaymentSummary({ ...base, amount_paid: 100, balance_due: 0 }).settlement).toBe('paid');
  });

  it('clamps progress to 1 when overpaid', () => {
    expect(getPaymentSummary({ ...base, amount_paid: 150, balance_due: 0 }).progress).toBe(1);
  });

  it('flags overdue only for issued, not-fully-paid invoices past due date', () => {
    const now = new Date('2026-06-07');
    expect(getPaymentSummary({ ...base, status: 'sent', due_date: '2026-06-01' }, now).isOverdue).toBe(true);
    // fully paid is never overdue
    expect(getPaymentSummary({ ...base, status: 'paid', payment_status: 'paid', amount_paid: 100, balance_due: 0, due_date: '2026-06-01' }, now).isOverdue).toBe(false);
    // a draft is not "issued", so never overdue
    expect(getPaymentSummary({ ...base, status: 'draft', due_date: '2026-06-01' }, now).isOverdue).toBe(false);
    // not past due yet
    expect(getPaymentSummary({ ...base, status: 'sent', due_date: '2026-06-30' }, now).isOverdue).toBe(false);
  });

  it('compares due date as a calendar date, not against UTC-midnight of the due date', () => {
    const dueToday = '2026-07-12';
    // Local noon on the due date — due today, not overdue yet.
    expect(
      getPaymentSummary({ ...base, status: 'sent', due_date: dueToday }, new Date(2026, 6, 12, 12, 0, 0)).isOverdue,
    ).toBe(false);
    // The evening BEFORE the due date must never read as overdue.
    expect(
      getPaymentSummary({ ...base, status: 'sent', due_date: dueToday }, new Date(2026, 6, 11, 23, 30, 0)).isOverdue,
    ).toBe(false);
    // Once the calendar due date has fully passed, it is overdue.
    expect(
      getPaymentSummary({ ...base, status: 'sent', due_date: dueToday }, new Date(2026, 6, 13, 0, 30, 0)).isOverdue,
    ).toBe(true);
  });
});

describe('getInvoiceEditability', () => {
  it('allows full edit only for a draft with no payments', () => {
    const e = getInvoiceEditability({ ...base, status: 'draft', payment_status: 'unpaid' });
    expect(e.mode).toBe('full');
    expect(e.isLocked).toBe(false);
    expect(e.editableFields).toBe('all');
  });

  it('restricts edit once issued (sent), even if unpaid', () => {
    const e = getInvoiceEditability({ ...base, status: 'sent', payment_status: 'unpaid' });
    expect(e.mode).toBe('restricted');
    expect(e.isLocked).toBe(true);
    expect(e.editableFields).toEqual(RESTRICTED_EDITABLE_FIELDS);
  });

  it('restricts edit once any payment exists', () => {
    expect(getInvoiceEditability({ ...base, status: 'partial', payment_status: 'partial', amount_paid: 40, balance_due: 60 }).mode).toBe('restricted');
    expect(getInvoiceEditability({ ...base, status: 'paid', payment_status: 'paid', amount_paid: 100, balance_due: 0 }).mode).toBe('restricted');
  });

  it('locks a draft that somehow has money received', () => {
    const e = getInvoiceEditability({ ...base, status: 'draft', payment_status: 'partial', amount_paid: 10, balance_due: 90 });
    expect(e.isLocked).toBe(true);
    expect(e.mode).toBe('restricted');
  });

  it('blocks all edits for terminal lifecycle states', () => {
    for (const status of ['cancelled', 'void', 'converted']) {
      const e = getInvoiceEditability({ ...base, status });
      expect(e.mode).toBe('none');
      expect(e.editableFields).toEqual([]);
      expect(e.reason).toBeTruthy();
    }
  });
});

describe('canRecordPayment', () => {
  it('allows recording on an issued, not-fully-paid tax invoice', () => {
    expect(canRecordPayment({ ...base, status: 'sent', payment_status: 'unpaid' })).toBe(true);
    expect(canRecordPayment({ ...base, status: 'partial', payment_status: 'partial', amount_paid: 40, balance_due: 60 })).toBe(true);
  });

  it('forbids recording when fully paid, proforma, draft, or terminal', () => {
    expect(canRecordPayment({ ...base, status: 'paid', payment_status: 'paid', amount_paid: 100, balance_due: 0 })).toBe(false);
    expect(canRecordPayment({ ...base, invoice_type: 'proforma', status: 'sent' })).toBe(false);
    expect(canRecordPayment({ ...base, status: 'draft' })).toBe(false);
    expect(canRecordPayment({ ...base, status: 'cancelled' })).toBe(false);
  });
});

describe('canIssueInvoice', () => {
  it('allows issuing a draft tax invoice (the step that makes it payable)', () => {
    expect(canIssueInvoice({ ...base, status: 'draft' })).toBe(true);
    expect(canIssueInvoice({ ...base })).toBe(true); // status defaults to draft
  });

  it('forbids issuing proformas and already-issued/terminal invoices', () => {
    expect(canIssueInvoice({ ...base, invoice_type: 'proforma', status: 'draft' })).toBe(false);
    expect(canIssueInvoice({ ...base, status: 'sent' })).toBe(false);
    expect(canIssueInvoice({ ...base, status: 'paid' })).toBe(false);
    expect(canIssueInvoice({ ...base, status: 'void' })).toBe(false);
  });
});

describe('canDeleteInvoice', () => {
  it('allows delete only for an unpaid draft', () => {
    expect(canDeleteInvoice({ ...base, status: 'draft', payment_status: 'unpaid' })).toBe(true);
  });
  it('forbids delete once issued or paid', () => {
    expect(canDeleteInvoice({ ...base, status: 'sent', payment_status: 'unpaid' })).toBe(false);
    expect(canDeleteInvoice({ ...base, status: 'partial', payment_status: 'partial', amount_paid: 1, balance_due: 99 })).toBe(false);
  });
});

describe('credited_amount in settlement (credit notes)', () => {
  it('counts credits toward settlement when payment_status is absent: 100 total, 60 paid, 40 credited => paid', () => {
    const s = getPaymentSummary({ ...base, amount_paid: 60, balance_due: undefined, credited_amount: 40 });
    expect(s.balance).toBe(0);
    expect(s.settlement).toBe('paid');
  });

  it('is partial when only credited: 100 total, 0 paid, 30 credited', () => {
    const s = getPaymentSummary({ ...base, amount_paid: 0, balance_due: undefined, credited_amount: 30 });
    expect(s.balance).toBe(70);
    expect(s.settlement).toBe('partial');
  });

  it('still prefers an explicit balance_due when present', () => {
    expect(getPaymentSummary({ ...base, amount_paid: 60, balance_due: 0, credited_amount: 40 }).balance).toBe(0);
  });

  it('reports actual cash paid separately from credits', () => {
    expect(getPaymentSummary({ ...base, amount_paid: 60, balance_due: undefined, credited_amount: 40 }).paid).toBe(60);
  });

  it('locks a fully-credited invoice', () => {
    const e = getInvoiceEditability({ ...base, status: 'sent', amount_paid: 0, balance_due: undefined, credited_amount: 100 });
    expect(e.isLocked).toBe(true);
    expect(e.mode).toBe('restricted');
  });
});

describe('canCreditInvoice', () => {
  it('allows crediting an issued tax invoice with an outstanding balance', () => {
    expect(canCreditInvoice({ ...base, status: 'sent', amount_paid: 40, balance_due: 60 })).toBe(true);
    expect(canCreditInvoice({ ...base, status: 'partial', payment_status: 'partial', amount_paid: 40, balance_due: 60 })).toBe(true);
  });

  it('forbids crediting drafts, proformas, fully-settled, or terminal invoices', () => {
    expect(canCreditInvoice({ ...base, status: 'draft' })).toBe(false);
    expect(canCreditInvoice({ ...base, invoice_type: 'proforma', status: 'sent' })).toBe(false);
    expect(canCreditInvoice({ ...base, status: 'paid', payment_status: 'paid', amount_paid: 100, balance_due: 0 })).toBe(false);
    expect(canCreditInvoice({ ...base, status: 'void', balance_due: 60 })).toBe(false);
  });

  it('uses the derived balance when balance_due is absent', () => {
    expect(canCreditInvoice({ ...base, status: 'sent', amount_paid: 30, balance_due: undefined })).toBe(true);
    expect(canCreditInvoice({ ...base, status: 'sent', amount_paid: 100, balance_due: undefined })).toBe(false);
  });
});
