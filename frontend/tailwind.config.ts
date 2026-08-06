import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Primary backgrounds — deep blacks inspired by the logo's dark faceted background
        'page-bg': '#0f0f0f',
        'card-bg': '#1a1a1a',
        'card-border': '#2a2a2a',
        // Subtle table header
        'table-header': '#1e1e1e',
        'table-header-text': '#c0c0c0',
        // Nav — dark charcoal sidebar
        'nav-bg': '#141414',
        'nav-border': '#2a2a2a',
        'nav-text': '#999999',
        'nav-active': '#ffffff',
        // Text colors — silver/white hierarchy
        'text-primary': '#f0f0f0',
        'text-secondary': '#a0a0a0',
        'text-muted': '#666666',
        'text-link': '#d0d0d0',
        // Accent colors — teal as primary action color, with status colors
        'accent-primary': '#ffffff',
        'accent-teal': '#10b981',
        'accent-teal-light': '#34d399',
        'accent-teal-dark': '#059669',
        'accent-purple': '#c0c0c0',
        'accent-purple-light': '#e0e0e0',
        'accent-pink': '#999999',
        'accent-cyan': '#a0a0a0',
        'accent-green': '#10b981',
        'accent-orange': '#f59e0b',
        'accent-blue': '#60a5fa',
        'accent-red': '#ef4444',
        'accent-coral': '#f87171',
        // Neutral surface for badges/hover
        'surface-muted': '#222222',
        // Buttons — teal primary for actions, red for destructive
        'btn-primary': '#10b981',
        'btn-danger': '#ef4444',
        'btn-success': '#10b981',
        // Input/form colors
        'input-bg': '#1a1a1a',
        'input-border': '#333333',
        'input-focus': '#10b981',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
