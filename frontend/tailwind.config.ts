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
        // Accent colors — silver/white primary; muted status colors kept minimal
        'accent-primary': '#ffffff',
        'accent-purple': '#c0c0c0',
        'accent-purple-light': '#e0e0e0',
        'accent-pink': '#999999',
        'accent-cyan': '#a0a0a0',
        'accent-green': '#8fcc8f',
        'accent-orange': '#d4a054',
        'accent-blue': '#b0b0b0',
        'accent-red': '#cc6666',
        // Neutral surface for badges/hover
        'surface-muted': '#222222',
        // Buttons — clean white primary, soft red for destructive
        'btn-primary': '#ffffff',
        'btn-danger': '#cc5555',
        'btn-success': '#6faa6f',
        // Input/form colors
        'input-bg': '#1a1a1a',
        'input-border': '#333333',
        'input-focus': '#ffffff',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
};

export default config;
