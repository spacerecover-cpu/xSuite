import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'security-headers',
      configureServer(server) {
        const securityHeaders = (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-XSS-Protection', '1; mode=block');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
          res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
          // Dev CSP: unsafe-inline/unsafe-eval required for Vite HMR
          res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws: wss: https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api-m.paypal.com https://api-m.sandbox.paypal.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self';");
          next();
        };
        server.middlewares.use(securityHeaders);
      },
      configurePreviewServer(server) {
        const securityHeaders = (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-XSS-Protection', '1; mode=block');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
          res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
          // Preview CSP: production-like, no unsafe-eval
          res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api-m.paypal.com https://api-m.sandbox.paypal.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self';");
          next();
        };
        server.middlewares.use(securityHeaders);
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // react-is must be named here explicitly: it is a shared dep of recharts
          // and app code, and without a home the bundler co-locates it inside
          // chart-libs — which then makes the whole eager graph (login included)
          // statically import the 320K recharts chunk just to reach react-is.
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-is') || id.includes('node_modules/react-router-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/@tanstack/react-query')) {
            return 'ui-libs';
          }
          if (id.includes('node_modules/react-hook-form')) {
            return 'form-libs';
          }
          // recharts deliberately has NO manualChunks entry: pinning it to a
          // named chunk made rolldown co-locate a shared CJS helper module in
          // that chunk, which turned the 320K chart bundle into a static
          // dependency of the whole eager graph (login screen included).
          // Unpinned, recharts splits into a lazy chunk reachable only from
          // the two chart pages (PlatformDashboard, StockReportsPage).
          if (id.includes('node_modules/pdfmake')) {
            return 'pdfmake-libs';
          }
          if (id.includes('node_modules/date-fns')) {
            return 'date-libs';
          }
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
            return 'i18n';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
});
