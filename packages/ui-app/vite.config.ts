import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  },
  resolve: {
    conditions: ['development', 'browser']
  }
})
