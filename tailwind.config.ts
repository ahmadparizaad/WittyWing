import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}', './src/popup.html'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1724',
        card: '#0f1724',
        glass: '#0b1220',
        muted: '#94a3b8',
        accent: '#7c3aed',
        'accent-2': '#06b6d4',
        'accent-3': '#1da1f2',
        success: '#16a34a',
        danger: '#dc2626',
        text: '#e6eef8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Poppins', 'Inter', 'Arial', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-body': 'linear-gradient(180deg, #07111b 0%, #071125 60%)',
        'gradient-primary': 'linear-gradient(180deg, #7c3aed, #06b6d4)',
        'gradient-signin': 'linear-gradient(90deg, #1da1f2, #7c3aed)',
        'card-bg': 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
      },
      boxShadow: {
        card: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 10px 22px rgba(0,0,0,0.6)',
        btn: '0 4px 14px rgba(2,6,23,0.5)',
        'btn-primary': '0 8px 24px rgba(7,3,29,0.5)',
        'btn-primary-hover': '0 10px 30px rgba(7,3,29,0.6)',
        'input-focus': '0 6px 18px rgba(124,58,237,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
