/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', 'node_modules/@dupipcom/oneiros/dist/**/*.{js,ts,jsx,tsx,mdx}'],
  safelist: ['bg-inverse-light', 'bg-inverse-dark', 'min-h-screen', 'md:min-h-0'],
  darkMode: ['variant', '.dark &:not(.dark .light *, .light .light *)', ''],
  presets: [require('@dupipcom/oneiros/dist/tailwind.config.js')],
  theme: {
    extend: {},
  },
  plugins: [],
};
