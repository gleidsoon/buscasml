import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#070b14',
        panel: '#111827',
        brand: {
          yellow: '#facc15',
          green: '#10b981',
          blue: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
};

export default config;
