import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(import.meta.dirname, '.env.test') })

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: 'list',
  workers: 1, // sequential — servers shared across tests
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000
  },
  webServer: {
    command: 'pnpm --filter @harmony/ui-app dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    {
      name: 'discord-integration',
      testMatch: /discord-integration\.spec\.ts/
    },
    {
      name: 'cross-topology',
      testMatch: /cross-topology\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173'
      }
    }
  ]
})
