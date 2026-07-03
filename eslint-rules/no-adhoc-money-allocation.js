// eslint-rules/no-adhoc-money-allocation.js
// Graft 9 enforcement: largest-remainder allocation is the ONLY sanctioned way
// to split a document-level money amount. Flags the proportional-split shape
// `(a * b) / c` where at least two operands are money-named — the exact
// CreditNoteModal.tsx:61 bug shape — and points to allocateLargestRemainder.
// `x * rate / 100` (percent of ONE amount) is NOT a split and is not flagged.

const MONEY_NAME = /(amount|total|subtotal|tax|discount|balance|paid|credited|price)/i;

function moneyOperandCount(node, src) {
  const texts = [];
  const collect = (n) => {
    if (!n) return;
    if (n.type === 'BinaryExpression') { collect(n.left); collect(n.right); return; }
    texts.push(src.getText(n));
  };
  collect(node);
  return texts.filter((t) => MONEY_NAME.test(t)).length;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Document-amount splits must use financialMath.allocateLargestRemainder (Σ(parts) === whole).' },
    schema: [],
    messages: {
      adhocAllocation:
        'Ad-hoc proportional money split. Use allocateLargestRemainder(total, weights, decimalPlaces) so parts sum exactly to the whole.',
    },
  },
  create(context) {
    const src = context.sourceCode || context.getSourceCode();
    return {
      BinaryExpression(node) {
        if (node.operator !== '/') return;
        if (node.left.type !== 'BinaryExpression' || node.left.operator !== '*') return;
        // percent-of-one-amount (`/ 100`) is not a split
        if (node.right.type === 'Literal' && node.right.value === 100) return;
        if (moneyOperandCount(node, src) < 2) return;
        context.report({ node, messageId: 'adhocAllocation' });
      },
    };
  },
};
