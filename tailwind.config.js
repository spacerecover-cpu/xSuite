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
        display: ['"DM Serif Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      spacing: {
        '4.5': '1.125rem',
      },
      fontSize: {
        'xxs': '0.625rem',
      },
      boxShadow: {
        'inner-sm': 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'glow-primary': '0 0 20px rgb(var(--color-primary) / 0.3)',
        'glow-primary-lg': '0 0 40px rgb(var(--color-primary) / 0.2)',
      },
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
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
      },
    },
  },
  plugins: [],
};
