import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [solid({ ssr: false })],
  resolve: {
    conditions: ['development', 'browser']
  },
  test: {
    environment: 'jsdom',
    root: resolve(__dir),
    server: {
      deps: {
        inline: [/solid-js/]
      }
    }
  }
})
