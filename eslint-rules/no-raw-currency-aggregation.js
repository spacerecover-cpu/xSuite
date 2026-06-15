// Custom (no-dependency) eslint rule: flags cross-document money aggregation that
// sums a RAW native amount instead of the base-currency *_base shadow. In a
// multi-currency tenant, SUM(total_amount) across documents in different
// currencies is arithmetically meaningless — only SUM(*_base) (via baseAmount /
// sumBase / groupSumBase / sumBankBalanceBase) is correct (D7/D8).
//
// CONSERVATIVE by design: only the two genuine aggregation shapes are flagged —
//   1. a `.reduce(...)` whose callback sums a money-field member access, and
//   2. an `acc += row.<moneyField>` accumulation —
// and only when the surrounding code shows NO base signal (`_base`, baseAmount(,
// sumBase(, groupSumBase(, sumBankBalanceBase(). A single-currency ROW display
// (e.g. `subtotal + tax` for one invoice) is not an aggregation and is not
// flagged; if a reduce/+= site is a legitimate single-currency rollup, silence it
// with `// eslint-disable-next-line no-raw-currency-aggregation -- single-currency`.
// Mirrors the module shape of no-untranslated-jsx-text.js.

const MONEY_FIELD_ACCESS =
  /\.(amount|total_amount|amount_paid|balance_due|current_balance|opening_balance|subtotal|tax_amount|discount_amount|total_earnings|total_deductions|net_salary)\b/;

// Any of these in the same callback / enclosing function means the author is
// already base-aware, so the aggregation is exempt.
const BASE_SIGNAL = /(_base\b|\bbaseAmount\s*\(|\bsumBase\s*\(|\bgroupSumBase\s*\(|\bsumBankBalanceBase\s*\()/;

function enclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (
      cur.type === 'FunctionDeclaration' ||
      cur.type === 'FunctionExpression' ||
      cur.type === 'ArrowFunctionExpression'
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Cross-document money aggregation must sum the *_base shadow (baseAmount/sumBase), never the raw native amount.',
    },
    schema: [],
    messages: {
      rawAggregation:
        'Raw currency aggregation over "{{field}}". Cross-document sums must use the *_base shadow (baseAmount/sumBase/groupSumBase). For a genuine single-currency rollup, add an inline eslint-disable comment.',
    },
  },
  create(context) {
    const src = context.sourceCode || context.getSourceCode();

    function firstMoneyField(text) {
      const m = text.match(MONEY_FIELD_ACCESS);
      return m ? m[1] : null;
    }

    return {
      'CallExpression[callee.property.name="reduce"]'(node) {
        const cb = node.arguments && node.arguments[0];
        if (!cb) return;
        const text = src.getText(cb);
        if (BASE_SIGNAL.test(text)) return;
        const field = firstMoneyField(text);
        if (field) {
          context.report({ node, messageId: 'rawAggregation', data: { field } });
        }
      },
      'AssignmentExpression[operator="+="]'(node) {
        const rhsText = src.getText(node.right);
        const field = firstMoneyField(rhsText);
        if (!field) return;
        const fn = enclosingFunction(node);
        if (fn && BASE_SIGNAL.test(src.getText(fn))) return;
        context.report({ node, messageId: 'rawAggregation', data: { field } });
      },
    };
  },
};
