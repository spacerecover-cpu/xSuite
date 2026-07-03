//
// L2 FISCAL KERNEL — pure, zero-I/O, golden-testable. All statutory FACTS
// (rates, rounding policy, registrations) arrive pre-resolved inside TaxContext;
// this module only does arithmetic + deterministic tracing. Strategies in
// src/lib/regimes/ select the scheme mode and re-stamp trace provenance.

import { allocateLargestRemainder, roundMoney, roundMoneyWith } from '../../financialMath';
import { backOutInclusive } from './backOutInclusive';
import type {
  ComputedTaxLine, DocumentNotation, GeoCountryTaxRateRow, RuleTrace, RuleTraceStep,
  SchemeMode, TaxComputation, TaxContext, TaxableLine,
} from '../../regimes/types';

export const KERNEL_VERSION = '1.0.0';

interface ComponentSpec {
  rateRowId: string;
  code: string;
  label: string;          // frozen render label, e.g. 'VAT 5%' / 'CGST 9%'
  rate: number;
  jurisdictionRef: string | null;
  sortOrder: number;
}

const label = (row: GeoCountryTaxRateRow): string =>
  `${row.component_label} ${formatRate(row.rate)}%`;

const formatRate = (rate: number): string =>
  Number.isInteger(rate) ? String(rate) : String(rate);

const toSpec = (row: GeoCountryTaxRateRow): ComponentSpec => ({
  rateRowId: row.id, code: row.component_code, label: label(row), rate: row.rate,
  jurisdictionRef: row.subdivision_id, sortOrder: row.sort_order,
});

/** Resolve the applicable component set once per document (algorithm step 6). */
function resolveComponents(ctx: TaxContext, mode: SchemeMode, steps: RuleTraceStep[]): ComponentSpec[] {
  const standard = ctx.rates
    .filter((r) => r.tax_category === 'standard')
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  let chosen: GeoCountryTaxRateRow[];
  if (mode === 'single') {
    chosen = standard.filter((r) => r.subdivision_id === null);
    steps.push({ op: 'scheme_decision', mode, detail: `single → [${chosen.map((r) => r.component_code).join(',')}]` });
  } else if (mode === 'split_by_place_of_supply') {
    const sellerSub = ctx.seller.registrations.find((g) => g.is_primary)?.subdivision_id
      ?? ctx.seller.subdivisionId;
    const intra = sellerSub !== null && ctx.placeOfSupplySubdivisionId !== null
      && sellerSub === ctx.placeOfSupplySubdivisionId;
    chosen = intra
      ? standard.filter((r) => r.component_code === 'CGST' || r.component_code === 'SGST')
      : standard.filter((r) => r.component_code === 'IGST');
    steps.push({
      op: 'scheme_decision', mode,
      detail: intra
        ? `intra_state ${sellerSub}==${ctx.placeOfSupplySubdivisionId} → CGST+SGST`
        : `inter_state ${sellerSub}≠${ctx.placeOfSupplySubdivisionId} → IGST`,
    });
  } else {
    // jurisdiction_stack: the context builder supplies rate rows already scoped
    // to the buyer's ship-to path; the kernel stacks each row whose subdivision
    // has a live seller registration (nexus as data). No registration → no
    // component (the caller marks lines out_of_scope — never a phantom 0%).
    const registeredSubs = new Set(
      ctx.seller.registrations.map((g) => g.subdivision_id).filter((s): s is string => s !== null),
    );
    chosen = standard.filter((r) => r.subdivision_id !== null && registeredSubs.has(r.subdivision_id));
    steps.push({
      op: 'scheme_decision', mode,
      detail: `stack over registered subdivisions → [${chosen.map((r) => r.component_code).join(',')}]`,
    });
  }
  for (const row of chosen) {
    steps.push({ op: 'rate_match', rateRowId: row.id, componentCode: row.component_code, rate: row.rate, validFrom: row.valid_from });
  }
  return chosen.map(toSpec);
}

const isTaxed = (t: TaxableLine): boolean => t.treatment === 'standard' || t.treatment === 'reduced';

/** The contract entry point: single-mode computation (simple_vat and defaults). */
export function computeDocumentTax(ctx: TaxContext): TaxComputation {
  return computeWithMode(ctx, 'single');
}

/** Parameterization seam for split/stack strategies (graft 8, Phases 4-5). */
export function computeWithMode(ctx: TaxContext, mode: SchemeMode): TaxComputation {
  const dp = ctx.rateContext.documentDecimals;
  const policy = ctx.roundingPolicy;
  const steps: RuleTraceStep[] = [];
  const notations: DocumentNotation[] = [];

  const components = resolveComponents(ctx, mode, steps);

  // 1. Per-line taxable (net of line discounts), dp-quantized — legacy parity.
  const lineTaxables = ctx.lines.map((l) => {
    const sub = roundMoney(l.quantity * l.unitPrice, dp);
    return roundMoney(sub - l.lineDiscount, dp);
  });

  // 2. Document-discount allocation across ALL lines (graft 9).
  let netTaxables = lineTaxables;
  if (ctx.documentDiscount !== 0) {
    const allocs = allocateLargestRemainder(ctx.documentDiscount, lineTaxables, dp);
    const weightSum = lineTaxables.reduce((s, w) => s + w, 0);
    steps.push({
      op: 'discount_allocation', method: 'largest_remainder', shares: allocs,
      remainders: lineTaxables.map((w) => {
        const exact = weightSum === 0 ? 0 : (ctx.documentDiscount * w) / weightSum;
        return roundMoney(exact - Math.floor(exact * 10 ** dp) / 10 ** dp, dp + 4);
      }),
    });
    netTaxables = lineTaxables.map((t, i) => roundMoney(t - allocs[i], dp));
  }

  // 3. Treatment classification steps + notations.
  ctx.lines.forEach((l) => {
    steps.push({ op: 'treatment', lineItemId: l.lineItemId, treatment: l.treatment, reasonCode: l.treatmentReasonCode });
    if (l.treatment === 'reverse_charge' && !notations.some((n) => n.code === 'REVERSE_CHARGE')) {
      notations.push({ code: 'REVERSE_CHARGE', text: 'Tax to be accounted for by the recipient (reverse charge).' });
    }
    if ((l.treatment === 'zero_rated' || l.treatment === 'exempt') && l.treatmentReasonCode
      && !notations.some((n) => n.code === l.treatmentReasonCode)) {
      notations.push({ code: l.treatmentReasonCode, text: `${l.treatment === 'zero_rated' ? 'Zero-rated' : 'Exempt'}: ${l.treatmentReasonCode}.` });
    }
  });

  const taxedIdx = ctx.lines.map((l, i) => (isTaxed(l) ? i : -1)).filter((i) => i >= 0);
  const sumRates = components.reduce((s, c) => s + c.rate, 0);

  let docTaxable: number;
  let lineBases: number[];           // per-line taxable base (post-inclusive-backout)
  const lineRows: ComputedTaxLine[] = [];
  const rollups: ComputedTaxLine[] = [];

  if (ctx.taxInclusive) {
    // 4a. Inclusive: back each taxed line's gross out, split its tax across
    // components by rate weights (largest remainder), so gross reconstitutes.
    lineBases = [...netTaxables];
    const perLineTax: number[][] = ctx.lines.map(() => components.map(() => 0));
    for (const i of taxedIdx) {
      const { base, tax } = backOutInclusive(netTaxables[i], sumRates, dp);
      steps.push({ op: 'inclusive_backout', gross: netTaxables[i], sumRates, base });
      lineBases[i] = base;
      perLineTax[i] = allocateLargestRemainder(tax, components.map((c) => c.rate), dp);
    }
    components.forEach((c, ci) => {
      const rollupTax = roundMoney(taxedIdx.reduce((s, i) => s + perLineTax[i][ci], 0), dp);
      const rollupBase = roundMoney(taxedIdx.reduce((s, i) => s + lineBases[i], 0), dp);
      rollups.push(componentRow(null, c, rollupBase, rollupTax, 'standard', null, ci));
      taxedIdx.forEach((i) => {
        lineRows.push(componentRow(ctx.lines[i].lineItemId, c, lineBases[i], perLineTax[i][ci], ctx.lines[i].treatment, ctx.lines[i].treatmentReasonCode, ci));
      });
    });
    docTaxable = roundMoney(lineBases.reduce((s, b) => s + b, 0), dp);
  } else {
    // 4b. Exclusive (the Oman parity path).
    lineBases = netTaxables;
    docTaxable = roundMoney(netTaxables.reduce((s, t) => s + t, 0), dp);
    const eligibleBase = roundMoney(taxedIdx.reduce((s, i) => s + netTaxables[i], 0), dp);
    components.forEach((c, ci) => {
      let rollupTax: number;
      let perLine: number[];
      if (policy.level === 'line') {
        perLine = taxedIdx.map((i) => roundMoneyWith((netTaxables[i] * c.rate) / 100, dp, policy));
        rollupTax = roundMoney(perLine.reduce((s, t) => s + t, 0), dp);
      } else {
        const before = (eligibleBase * c.rate) / 100;
        rollupTax = roundMoneyWith(before, dp, policy);
        steps.push({ op: 'rounding', policy, before, after: rollupTax });
        perLine = allocateLargestRemainder(rollupTax, taxedIdx.map((i) => netTaxables[i]), dp);
      }
      rollups.push(componentRow(null, c, eligibleBase, rollupTax, 'standard', null, ci));
      taxedIdx.forEach((i, k) => {
        lineRows.push(componentRow(ctx.lines[i].lineItemId, c, netTaxables[i], perLine[k], ctx.lines[i].treatment, ctx.lines[i].treatmentReasonCode, ci));
      });
    });
  }

  // 5. Zero-amount evidence rows for non-taxed treatments (classification preserved).
  ctx.lines.forEach((l, i) => {
    if (!isTaxed(l)) {
      const c = components[0] ?? { rateRowId: 'none', code: 'VAT', label: 'VAT 0%', rate: 0, jurisdictionRef: null, sortOrder: 0 };
      lineRows.push({
        lineItemId: l.lineItemId, componentCode: c.code, componentLabel: `${c.code} 0%`,
        jurisdictionRef: null, rate: 0, taxableBase: lineBases[i], taxAmount: 0,
        taxTreatment: l.treatment, treatmentReasonCode: l.treatmentReasonCode, sequence: components.length,
      });
    }
  });

  // 6. Totals: header tax is DEFINITIONALLY Σ rollups — never recomputed.
  const taxTotal = roundMoney(rollups.reduce((s, r) => s + r.taxAmount, 0), dp);
  let grandTotal: number;
  let roundingAdjustment: number | null = null;
  if (ctx.taxInclusive) {
    grandTotal = roundMoney(docTaxable + taxTotal, dp);
  } else {
    grandTotal = roundMoney(docTaxable + taxTotal, dp);
  }
  if (policy.cash_increment && policy.cash_increment > 0) {
    const inc = policy.cash_increment;
    const rounded = roundMoney(Math.round(grandTotal / inc) * inc, dp);
    roundingAdjustment = roundMoney(rounded - grandTotal, dp);
    steps.push({ op: 'cash_rounding', increment: inc, adjustment: roundingAdjustment });
    grandTotal = rounded;
  }

  const trace: RuleTrace = {
    regimeKey: 'kernel', pluginVersion: KERNEL_VERSION, packVersionId: null, schemeMode: mode, steps,
  };
  return {
    lines: lineRows, rollups,
    totals: { taxableBase: docTaxable, taxTotal, grandTotal, roundingAdjustment },
    expectedWithholding: null, notations, trace,
  };
}

function componentRow(
  lineItemId: string | null, c: ComponentSpec, taxableBase: number, taxAmount: number,
  treatment: ComputedTaxLine['taxTreatment'], reasonCode: string | null, sequence: number,
): ComputedTaxLine {
  return {
    lineItemId, componentCode: c.code, componentLabel: c.label, jurisdictionRef: c.jurisdictionRef,
    rate: c.rate, taxableBase, taxAmount, taxTreatment: treatment, treatmentReasonCode: reasonCode, sequence,
  };
}
