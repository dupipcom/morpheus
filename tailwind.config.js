/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', 'node_modules/@dreampipcom/oneiros/dist/**/*.{js,ts,jsx,tsx,mdx,css}'],
  safelist: ['bg-inverse-light', 'bg-inverse-dark', 'min-h-screen', 'md:min-h-0', 'p-a8', 'dark', 'light'],
  darkMode: ['variant', '.dark &:not(.dark .light *, .light .light *)', ''],
  presets: [require('@dreampipcom/oneiros/dist/tailwind.config.js')],
  theme: {
    extend: {},
  },
  plugins: [],
}