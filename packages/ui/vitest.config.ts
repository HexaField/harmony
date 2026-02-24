import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser']
  },
  test: {
    environment: 'jsdom',
    root: resolve(__dirname)
  }
})
