// Flags any import of `react-hot-toast` outside the single sanctioned wrapper
// (`src/hooks/useToast.tsx`). The themed `useToast()` hook renders the custom
// `<Toast>` component so notifications follow the active per-tenant theme; raw
// `react-hot-toast` imports bypass that and render with the transparent
// Toaster style (i.e. invisibly). Centralizing on the wrapper keeps the toast
// surface consistent and themeable.
//
// Detection covers ES imports (`import toast from 'react-hot-toast'`, named,
// namespace, and side-effect imports), `export ... from 'react-hot-toast'`,
// `require('react-hot-toast')`, and dynamic `import('react-hot-toast')`. The
// wrapper file itself is exempt by filename so it can keep its one legitimate
// import.

const PACKAGE = 'react-hot-toast';
// The only file allowed to import react-hot-toast directly.
const WRAPPER_SUFFIX = 'src/hooks/useToast.tsx';

function isWrapperFile(context) {
  // ESLint v9 / typescript-eslint v8 expose `context.filename`; fall back to
  // the legacy getter for safety. Normalize Windows separators before matching.
  const filename =
    (typeof context.filename === 'string' && context.filename) ||
    (typeof context.getFilename === 'function' && context.getFilename()) ||
    '';
  return filename.replace(/\\/g, '/').endsWith(WRAPPER_SUFFIX);
}

function isPackageString(node) {
  return node && node.type === 'Literal' && node.value === PACKAGE;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow importing react-hot-toast outside src/hooks/useToast.tsx; use the themed useToast() hook instead.',
    },
    schema: [],
    messages: {
      raw: 'Do not import react-hot-toast directly. Use useToast() from hooks/useToast instead (the only sanctioned, themed wrapper).',
    },
  },
  create(context) {
    if (isWrapperFile(context)) return {};

    function reportSource(sourceNode) {
      if (isPackageString(sourceNode)) {
        context.report({ node: sourceNode, messageId: 'raw' });
      }
    }

    return {
      // import ... from 'react-hot-toast'. Allow infrastructure imports that do
      // NOT pull in the `toast` function (e.g. `import { Toaster }` at the single
      // mount point in App.tsx); ban the default/namespace/side-effect import and
      // a named `toast` import anywhere.
      ImportDeclaration(node) {
        if (!isPackageString(node.source)) return;
        const importsToast =
          node.specifiers.length === 0 ||
          node.specifiers.some(
            (s) =>
              s.type === 'ImportDefaultSpecifier' ||
              s.type === 'ImportNamespaceSpecifier' ||
              (s.type === 'ImportSpecifier' && s.imported && s.imported.name === 'toast'),
          );
        if (importsToast) context.report({ node: node.source, messageId: 'raw' });
      },
      // export ... from 'react-hot-toast'
      ExportNamedDeclaration(node) {
        if (node.source) reportSource(node.source);
      },
      ExportAllDeclaration(node) {
        if (node.source) reportSource(node.source);
      },
      // require('react-hot-toast')
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && callee.name === 'require') {
          reportSource(node.arguments[0]);
        }
      },
      // dynamic import('react-hot-toast') — parsed as ImportExpression (with a
      // `.source`), not a CallExpression, by typescript-eslint / ESTree.
      ImportExpression(node) {
        reportSource(node.source);
      },
    };
  },
};
