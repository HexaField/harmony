#!/usr/bin/env node
// @harmony/server-runtime — Production server entrypoint
// Usage: node --import tsx bin/harmony-server.js [options]

import { config as loadEnv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// Load .env from monorepo root
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })
import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { ServerRuntime, loadConfig } from '../src/index.ts'

const { values } = parseArgs({
  options: {
    config: { type: 'string', short: 'c' },
    port: { type: 'string', short: 'p' },
    foreground: { type: 'boolean', short: 'f', default: true },
    help: { type: 'boolean', short: 'h' }
  },
  strict: false,
  allowPositionals: true
})

if (values.help) {
  console.log(`
Harmony Server Runtime

Usage:
  harmony-server [options]

Options:
  -c, --config <path>   Path to harmony.config.yaml (default: ./harmony.config.yaml)
  -p, --port <number>   Override server port
  -f, --foreground      Run in foreground (default: true)
  -h, --help            Show this help message
`)
  process.exit(0)
}

const configPath = values.config ? resolve(values.config) : resolve('harmony.config.yaml')

let config
if (existsSync(configPath)) {
  config = loadConfig(configPath)
} else {
  // Use defaults if no config file — env vars override
  const envPort = process.env.HARMONY_PORT ? parseInt(process.env.HARMONY_PORT, 10) : 4000
  const envHost = process.env.HARMONY_HOST || '0.0.0.0'
  config = {
    server: { host: envHost, port: envPort },
    storage: {
      database: process.env.HARMONY_DB_PATH || './harmony.db',
      media: process.env.HARMONY_MEDIA_PATH || './media'
    },
    identity: {},
    federation: { enabled: false },
    relay: { enabled: false },
    moderation: {},
    voice: { enabled: false },
    logging: { level: 'info', format: 'text' },
    limits: {
      maxConnections: 1000,
      maxCommunities: 100,
      maxChannelsPerCommunity: 500,
      maxMessageSize: 16384,
      mediaMaxSize: 52428800
    }
  }
}

// Apply port override
if (values.port) {
  const port = parseInt(values.port, 10)
  if (!isNaN(port) && port > 0 && port <= 65535) {
    config.server.port = port
  }
}

const runtime = new ServerRuntime(config, existsSync(configPath) ? configPath : undefined)

async function main() {
  try {
    await runtime.start()
    const healthPort = config.server.port + 1
    console.log(`Harmony server listening on ${config.server.host}:${config.server.port}`)
    console.log(
      `Health endpoint at http://${config.server.host === '0.0.0.0' ? 'localhost' : config.server.host}:${healthPort}/health`
    )
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

main()
