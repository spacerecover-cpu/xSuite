// Custom (no-dependency) eslint rule: flags hardcoded-locale number/date
// formatting that bypasses the tenant's resolved locale. In a worldwide,
// multi-tenant platform a fixed 'en-US' / 'en-GB' locale forces Western
// grouping, currency placement and date order onto every tenant regardless of
// their Country-Engine config. Money/date rendering MUST flow through the
// tenant config: useCurrency() / formatCurrencyWithConfig (currency),
// formatDateTimeWithConfig (dates), or useDateTimeConfig().
//
// Flagged shapes (only when the FIRST argument is an 'en-US'/'en-GB' string
// literal — a locale variable, an Intl.NumberFormat() with no locale, or any
// other locale is NOT flagged):
//   1. `X.toLocaleString('en-US', ...)`
//   2. `X.toLocaleDateString('en-GB', ...)`
//   3. `X.toLocaleTimeString('en-US', ...)`
//   4. `new Intl.NumberFormat('en-US', ...)` / `Intl.NumberFormat('en-GB', ...)`
//   5. `new Intl.DateTimeFormat('en-US', ...)` / `Intl.DateTimeFormat('en-GB', ...)`
//
// CONSERVATIVE by design: a fixed locale is sometimes genuinely required
// (machine-readable output, a deliberately neutral platform-level surface that
// lives outside TenantConfigProvider — e.g. the cross-tenant platform-admin
// dashboard). For those, silence the site with a reasoned inline disable:
//   // eslint-disable-next-line xsuite/no-hardcoded-locale-format -- <reason>
// Mirrors the module shape of no-raw-currency-aggregation.js.

const HARDCODED_LOCALES = new Set(['en-US', 'en-GB']);
const TO_LOCALE_METHODS = new Set([
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
]);
const INTL_FORMATTERS = new Set(['NumberFormat', 'DateTimeFormat']);

function firstArgIsHardcodedLocale(node) {
  const first = node.arguments && node.arguments[0];
  return (
    first &&
    first.type === 'Literal' &&
    typeof first.value === 'string' &&
    HARDCODED_LOCALES.has(first.value)
  );
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Number/date formatting must use the tenant's resolved locale (useCurrency/formatCurrencyWithConfig/formatDateTimeWithConfig), not a hardcoded 'en-US'/'en-GB'.",
    },
    schema: [],
    messages: {
      hardcodedLocale:
        "Hardcoded '{{locale}}' locale in {{api}}. Use the tenant config (useCurrency()/formatCurrencyWithConfig for money, formatDateTimeWithConfig for dates). For a genuinely locale-neutral surface, add a reasoned inline eslint-disable comment.",
    },
  },
  create(context) {
    // Intl.NumberFormat / Intl.DateTimeFormat appear BOTH as a NewExpression
    // (`new Intl.NumberFormat('en-US')`) and a plain CallExpression
    // (`Intl.NumberFormat('en-US')`) — the AST node type differs but the callee
    // shape is identical, so handle both.
    function checkIntl(node) {
      const callee = node.callee;
      if (
        callee &&
        callee.type === 'MemberExpression' &&
        callee.object &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'Intl' &&
        callee.property &&
        callee.property.type === 'Identifier' &&
        INTL_FORMATTERS.has(callee.property.name) &&
        firstArgIsHardcodedLocale(node)
      ) {
        context.report({
          node,
          messageId: 'hardcodedLocale',
          data: { locale: node.arguments[0].value, api: `Intl.${callee.property.name}` },
        });
      }
    }

    return {
      // X.toLocaleString('en-US', ...) / toLocaleDateString / toLocaleTimeString
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee &&
          callee.type === 'MemberExpression' &&
          callee.property &&
          callee.property.type === 'Identifier' &&
          TO_LOCALE_METHODS.has(callee.property.name) &&
          firstArgIsHardcodedLocale(node)
        ) {
          context.report({
            node,
            messageId: 'hardcodedLocale',
            data: { locale: node.arguments[0].value, api: callee.property.name },
          });
          return;
        }
        // Plain-call form: Intl.NumberFormat('en-US', ...)
        checkIntl(node);
      },
      // new Intl.NumberFormat('en-US', ...) / new Intl.DateTimeFormat('en-GB', ...)
      NewExpression(node) {
        checkIntl(node);
      },
    };
  },
};
