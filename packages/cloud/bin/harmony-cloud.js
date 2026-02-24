#!/usr/bin/env node
import { config as loadEnv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname =
  typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url))

loadEnv({ path: resolve(__dirname, '../../../.env') })

import { createCryptoProvider } from '@harmony/crypto'
import { createCloudApp } from '../src/index.js'

const PORT = parseInt(process.env.CLOUD_PORT || '3002', 10)

async function main() {
  const crypto = createCryptoProvider()
  const { app } = await createCloudApp(crypto)

  app.listen(PORT, () => {
    console.log(`Harmony Cloud service running on port ${PORT}`)
  })
}

main().catch((err) => {
  console.error('Failed to start cloud service:', err)
  process.exit(1)
})
