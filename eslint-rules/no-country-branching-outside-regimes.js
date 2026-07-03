// eslint-rules/no-country-branching-outside-regimes.js
// The institutionalized lesson of einvoiceRouting.ts:6 / invoiceAdapter.ts:38:
// no `if (countryCode === 'XX')` outside src/lib/regimes/. Statutory branching
// is a typed plugin selected BY DATA (regime.* keys), never an inline hardcode.
// Conservative: flags equality comparisons between a country-ish identifier
// (/country(_?code)?$/i on an Identifier or MemberExpression property) and a
// 2-uppercase-letter string literal, plus switch() on a country-ish identifier
// with 2-letter case labels. src/lib/regimes/** is exempted in eslint.config.js.

const COUNTRY_IDENT = /country(_?code)?$/i;
const ISO2 = /^[A-Z]{2}$/;

function isCountryRef(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return COUNTRY_IDENT.test(node.name);
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return COUNTRY_IDENT.test(node.property.name);
  }
  return false;
}
const isIso2Literal = (node) =>
  node && node.type === 'Literal' && typeof node.value === 'string' && ISO2.test(node.value);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Country branching belongs in src/lib/regimes/ plugins selected by regime.* data keys.' },
    schema: [],
    messages: {
      countryBranch:
        'Country branching ("{{code}}") outside src/lib/regimes/. Move the behavior into a regime plugin and select it via the regime.* config keys.',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!['===', '!==', '==', '!='].includes(node.operator)) return;
        const pairs = [[node.left, node.right], [node.right, node.left]];
        for (const [ref, lit] of pairs) {
          if (isCountryRef(ref) && isIso2Literal(lit)) {
            context.report({ node, messageId: 'countryBranch', data: { code: lit.value } });
            return;
          }
        }
      },
      SwitchStatement(node) {
        if (isCountryRef(node.discriminant) && node.cases.some((c) => isIso2Literal(c.test))) {
          context.report({ node: node.discriminant, messageId: 'countryBranch', data: { code: 'switch' } });
        }
      },
    };
  },
};
