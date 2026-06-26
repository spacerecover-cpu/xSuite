/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
      },
      fontFamily: {
        // App-wide typeface: Inter. `sans` is set so Tailwind Preflight applies
        // it to <html>, making Inter the global default; `body`/`display` resolve
        // to Inter too so existing font-body/font-display usages follow suit.
        sans: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '4.5': '1.125rem',
      },
      fontSize: {
        'xxs': '0.625rem',
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
