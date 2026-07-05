/** @type {import('tailwindcss').Config} */

// Var-backed NEUTRAL layer (DESIGN.md → Color → Neutral ramp). The white/slate
// utilities are remapped PER UTILITY to CSS variables so the whole app
// re-skins under data-theme="midnight" with zero call-site churn. The light
// themes bind the vars to the exact Tailwind v3.4 slate values (pixel
// identical); only the midnight block in src/index.css rebinds them. Shades
// not var-backed for a given utility keep the literal value below.
const nv = (v) => `rgb(var(${v}) / <alpha-value>)`;
const SLATE = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#020617',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Backgrounds: bg-white = card, bg-slate-50 = page, 100/200/300 =
      // raised/strong/inset fills, 700/800/900 = the dark-chrome fills
      // (tooltips, scrims, media panels). text-white stays literal — it is
      // ink on colored fills, never a surface.
      backgroundColor: {
        white: nv('--nb-card'),
        slate: {
          ...SLATE,
          50: nv('--nb-page'),
          100: nv('--nb-raised'),
          200: nv('--nb-strong'),
          300: nv('--nb-inset'),
          700: nv('--nb-dim'),
          800: nv('--nb-dark'),
          900: nv('--nb-deep'),
        },
      },
      // Text ink: slate-300..900 invert on midnight (300 doubles as the
      // platform-admin dark-sidebar nav tone — its midnight value is
      // AA-checked on both card and deep surfaces). slate-50..200 + white
      // stay literal: they are only ever ink on dark/colored fills.
      textColor: {
        slate: {
          ...SLATE,
          300: nv('--nt-300'),
          400: nv('--nt-400'),
          500: nv('--nt-500'),
          600: nv('--nt-600'),
          700: nv('--nt-700'),
          800: nv('--nt-800'),
          900: nv('--nt-900'),
        },
      },
      // Edges. DEFAULT rebinding also fixes a latent drift: bare `border`
      // rendered Tailwind's gray-200 #e5e7eb (the gray palette is banned) —
      // it now follows the slate-200-equivalent edge token. divideColor
      // derives from borderColor automatically.
      borderColor: {
        DEFAULT: nv('--ne-base'),
        slate: {
          ...SLATE,
          100: nv('--ne-soft'),
          200: nv('--ne-base'),
          300: nv('--ne-strong'),
        },
      },
      ringColor: {
        slate: {
          ...SLATE,
          100: nv('--ne-soft'),
          200: nv('--ne-base'),
          300: nv('--ne-strong'),
        },
      },
      ringOffsetColor: {
        white: nv('--nb-card'),
        slate: {
          ...SLATE,
          50: nv('--nb-page'),
        },
      },
      gradientColorStops: {
        white: nv('--nb-card'),
        slate: {
          ...SLATE,
          50: nv('--nb-page'),
          100: nv('--nb-raised'),
          200: nv('--nb-strong'),
        },
      },
      placeholderColor: {
        slate: {
          ...SLATE,
          400: nv('--nt-400'),
          500: nv('--nt-500'),
        },
      },
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        'secondary-foreground': 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-foreground': 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--color-surface-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-foreground': 'rgb(var(--color-success-foreground) / <alpha-value>)',
        'success-muted': 'rgb(var(--color-success-muted) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-foreground': 'rgb(var(--color-warning-foreground) / <alpha-value>)',
        'warning-muted': 'rgb(var(--color-warning-muted) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-foreground': 'rgb(var(--color-danger-foreground) / <alpha-value>)',
        'danger-muted': 'rgb(var(--color-danger-muted) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        'info-foreground': 'rgb(var(--color-info-foreground) / <alpha-value>)',
        'info-muted': 'rgb(var(--color-info-muted) / <alpha-value>)',
        // Categorical palette — fixed, NOT themed (mirrors chartCategorical).
        // Distinct IDENTITY color only (per-module, device-type, category
        // tiles). Never use for status. Muted bg via alpha, e.g. bg-cat-1/10.
        'cat-1': 'rgb(var(--color-cat-1) / <alpha-value>)',
        'cat-2': 'rgb(var(--color-cat-2) / <alpha-value>)',
        'cat-3': 'rgb(var(--color-cat-3) / <alpha-value>)',
        'cat-4': 'rgb(var(--color-cat-4) / <alpha-value>)',
        'cat-5': 'rgb(var(--color-cat-5) / <alpha-value>)',
        'cat-6': 'rgb(var(--color-cat-6) / <alpha-value>)',
        'cat-7': 'rgb(var(--color-cat-7) / <alpha-value>)',
        'cat-8': 'rgb(var(--color-cat-8) / <alpha-value>)',
        // Fixed dark ink for saturated fills (amber/lime KPI tiles, colored
        // pill tabs). Deliberately NOT themed: on a vivid gradient the ink
        // must stay dark in every theme, including midnight where the
        // slate-900 text utility inverts to near-white.
        'ink-dark': 'rgb(var(--color-ink-dark) / <alpha-value>)',
      },
      fontFamily: {
        // App-wide typeface: Inter. `sans` is set so Tailwind Preflight applies
        // it to <html>, making Inter the global default. The legacy body/display
        // aliases (both = Inter) were removed 2026-07-02 (DESIGN.md → Typography).
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Platform monospace — for character-verified strings only (serials,
        // hashes, SKUs, codes, OTP, JSON, kbd). Same stack as the Tailwind
        // default, pinned here so the token is explicit per DESIGN.md.
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
        // The single sanctioned scoped exception to the one-typeface rule:
        // Chakra Petch for the AUTH ZONE ONLY (wordmark + headline on
        // login/reset/signup). Never use in the app shell — see DESIGN.md.
        'display-auth': ['"Chakra Petch"', 'Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '4.5': '1.125rem',
      },
      fontSize: {
        'xxs': '0.625rem',
        // App-chrome text size (top-bar title/crumbs, sidebar nav items) —
        // the shell's compact 13px tier, tokenized 2026-07-02 (DESIGN.md →
        // Typography → Sizes). Content surfaces never use it.
        'nav': ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      boxShadow: {
        // Retained, deliberately: a themed decorative glow for the onboarding
        // step-icon tile (StepContainer). NOT part of the Elevation ladder
        // (shadow-sm..xl); see DESIGN.md Known Deviations #11.
        'glow-primary': '0 0 20px rgb(var(--color-primary) / 0.3)',
      },
      // Named z-index scale — mirrors src/lib/ui/zIndex.ts (see DESIGN.md →
      // Z-Index Scale). Default Tailwind z-0..z-50/z-auto remain available for
      // local, panel-internal stacking contexts.
      zIndex: {
        sticky: '20',
        dropdown: '30',
        overlay: '40',
        modal: '50',
        popover: '60',
        toast: '70',
      },
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'nav-progress': 'navProgress 1.2s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        navProgress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
    },
  },
  plugins: [],
};
