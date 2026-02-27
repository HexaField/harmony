import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(import.meta.dirname, '.env.test') })

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'discord-integration',
      testMatch: /discord-integration\.spec\.ts/
    }
  ]
})
