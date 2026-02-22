/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        'hm-bg': '#36393f',
        'hm-bg-dark': '#2f3136',
        'hm-bg-darker': '#202225',
        'hm-bg-darkest': '#18191c',
        'hm-text': '#dcddde',
        'hm-text-muted': '#72767d',
        'hm-text-link': '#00aff4',
        'hm-accent': '#5865f2',
        'hm-accent-hover': '#4752c4',
        'hm-green': '#3ba55c',
        'hm-red': '#ed4245',
        'hm-yellow': '#faa61a'
      }
    }
  },
  plugins: []
}
