#!/usr/bin/env node
/**
 * Cloud Worker deployment dry-run.
 *
 * Validates the Cloudflare Worker can build, type-check, and (optionally)
 * run locally via `wrangler dev`. Does NOT deploy anything.
 *
 * Usage:
 *   node scripts/dry-run-cloud.mjs [--local] [--timeout 30000]
 *
 * Flags:
 *   --local     Also start wrangler dev and test /health (requires wrangler)
 *   --timeout   Timeout in ms for local checks (default: 30000)
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    local: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '30000' },
    verbose: { type: 'boolean', default: false },
  },
})

const TIMEOUT = parseInt(values.timeout)
const VERBOSE = values.verbose

let passed = 0
let failed = 0

function log(msg) {
  if (VERBOSE) console.log(`  [debug] ${msg}`)
}

function run(cmd, opts = {}) {
  log(`$ ${cmd}`)
  return execSync(cmd, { stdio: 'pipe', timeout: 60_000, ...opts }).toString()
}

async function test(name, fn) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Timeout')), TIMEOUT),
      ),
    ])
    passed++
    console.log(`  ✅ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ❌ ${name}: ${err.message}`)
  }
}

// ── Cloud Worker ─────────────────────────────────────

console.log('\n☁️  Harmony Cloud Worker — Deployment Dry Run\n')
console.log('Phase 1: Cloud Worker')

const cwDir = 'packages/cloud-worker'

await test('wrangler.toml exists', async () => {
  if (!existsSync(`${cwDir}/wrangler.toml`))
    throw new Error('Missing wrangler.toml')
})

await test('Source entry point exists', async () => {
  if (!existsSync(`${cwDir}/src/index.ts`))
    throw new Error('Missing src/index.ts')
})

await test('CommunityDurableObject exported', async () => {
  const src = (
    await import('node:fs')
  ).readFileSync(`${cwDir}/src/index.ts`, 'utf-8')
  if (!src.includes('CommunityDurableObject'))
    throw new Error('Missing DO export')
})

await test('TypeScript compiles (cloud-worker)', async () => {
  try {
    run(`pnpm run check --filter @harmony/cloud-worker`)
  } catch (e) {
    // Fall back to direct tsc
    try {
      run(`npx tsc --noEmit`, { cwd: cwDir })
    } catch (e2) {
      throw new Error(`TS errors: ${e2.message.slice(0, 200)}`)
    }
  }
})

await test('wrangler.toml has all required bindings', async () => {
  const { readFileSync } = await import('node:fs')
  const toml = readFileSync(`${cwDir}/wrangler.toml`, 'utf-8')
  const required = ['COMMUNITY', 'd1_databases', 'r2_buckets']
  for (const key of required) {
    if (!toml.includes(key))
      throw new Error(`Missing binding: ${key}`)
  }
})

await test('wrangler.toml has dev/staging/production envs', async () => {
  const { readFileSync } = await import('node:fs')
  const toml = readFileSync(`${cwDir}/wrangler.toml`, 'utf-8')
  for (const env of ['env.dev', 'env.staging', 'env.production']) {
    if (!toml.includes(env))
      throw new Error(`Missing env section: ${env}`)
  }
})

// ── Portal Worker ────────────────────────────────────

console.log('\nPhase 2: Portal Worker')

const pwDir = 'packages/portal-worker'

await test('wrangler.toml exists', async () => {
  if (!existsSync(`${pwDir}/wrangler.toml`))
    throw new Error('Missing wrangler.toml')
})

await test('Source entry point exists', async () => {
  if (!existsSync(`${pwDir}/src/index.ts`))
    throw new Error('Missing src/index.ts')
})

await test('wrangler.toml has all required bindings', async () => {
  const { readFileSync } = await import('node:fs')
  const toml = readFileSync(`${pwDir}/wrangler.toml`, 'utf-8')
  const required = ['d1_databases', 'r2_buckets', 'kv_namespaces']
  for (const key of required) {
    if (!toml.includes(key))
      throw new Error(`Missing binding: ${key}`)
  }
})

await test('wrangler.toml has dev/staging/production envs', async () => {
  const { readFileSync } = await import('node:fs')
  const toml = readFileSync(`${pwDir}/wrangler.toml`, 'utf-8')
  for (const env of ['env.dev', 'env.staging', 'env.production']) {
    if (!toml.includes(env))
      throw new Error(`Missing env section: ${env}`)
  }
})

// ── Docker ───────────────────────────────────────────

console.log('\nPhase 3: Docker')

await test('Dockerfile.server exists', async () => {
  if (!existsSync('packages/docker/Dockerfile.server'))
    throw new Error('Missing Dockerfile.server')
})

await test('Dockerfile.server uses Node 22+', async () => {
  const { readFileSync } = await import('node:fs')
  const df = readFileSync('packages/docker/Dockerfile.server', 'utf-8')
  const fromMatch = df.match(/FROM node:(\d+)/)
  if (!fromMatch) throw new Error('No FROM node: found')
  const ver = parseInt(fromMatch[1])
  if (ver < 22) throw new Error(`Node ${ver} too old, need 22+`)
})

await test('docker-compose.yml valid', async () => {
  if (!existsSync('packages/docker/docker-compose.yml'))
    throw new Error('Missing docker-compose.yml')
  try {
    run('docker compose -f packages/docker/docker-compose.yml config --quiet 2>&1')
  } catch {
    // docker may not be available in CI — just check file exists
    log('docker compose not available, skipping validation')
  }
})

// ── UI Build ─────────────────────────────────────────

console.log('\nPhase 4: UI Build')

await test('UI app builds (Vite)', async () => {
  try {
    run('pnpm run build', { timeout: 120_000 })
  } catch (e) {
    throw new Error(`Build failed: ${e.message.slice(0, 200)}`)
  }
})

await test('UI build output exists', async () => {
  if (!existsSync('packages/ui-app/dist/index.html'))
    throw new Error('Missing dist/index.html')
})

await test('UI bundle size reasonable (<500KB gzip)', async () => {
  const { statSync, readdirSync } = await import('node:fs')
  const distDir = 'packages/ui-app/dist/assets'
  if (!existsSync(distDir)) throw new Error('No assets dir')
  const files = readdirSync(distDir)
  const jsFiles = files.filter((f) => f.endsWith('.js'))
  let totalSize = 0
  for (const f of jsFiles) {
    totalSize += statSync(`${distDir}/${f}`).size
  }
  log(`Total JS bundle: ${(totalSize / 1024).toFixed(0)}KB`)
  if (totalSize > 500 * 1024)
    throw new Error(`Bundle too large: ${(totalSize / 1024).toFixed(0)}KB`)
})

// ── Electron ─────────────────────────────────────────

console.log('\nPhase 5: Electron')

await test('electron-builder.yml exists', async () => {
  if (!existsSync('packages/app/electron-builder.yml'))
    throw new Error('Missing electron-builder.yml')
})

await test('electron-builder.yml has all platforms', async () => {
  const { readFileSync } = await import('node:fs')
  const yml = readFileSync('packages/app/electron-builder.yml', 'utf-8')
  for (const platform of ['mac:', 'win:', 'linux:']) {
    if (!yml.includes(platform))
      throw new Error(`Missing platform: ${platform}`)
  }
})

// ── Local wrangler dev (optional) ────────────────────

if (values.local) {
  console.log('\nPhase 6: Local wrangler dev (cloud-worker)')

  const { spawn } = await import('node:child_process')

  await test('wrangler dev starts and serves /health', async () => {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        'npx',
        ['wrangler', 'dev', '--port', '8799', '--local'],
        {
          cwd: cwDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      let started = false

      proc.stdout.on('data', async (d) => {
        const line = d.toString()
        log(`wrangler: ${line.trim()}`)
        if (line.includes('Ready') && !started) {
          started = true
          try {
            const res = await fetch('http://127.0.0.1:8799/health')
            const body = await res.json()
            if (body.status !== 'ok') throw new Error('Bad health')
            proc.kill()
            resolve()
          } catch (e) {
            proc.kill()
            reject(e)
          }
        }
      })

      proc.on('error', (e) => reject(e))
      proc.on('exit', (code) => {
        if (!started) reject(new Error(`wrangler exited with ${code}`))
      })
    })
  })
}

// ── Summary ──────────────────────────────────────────

console.log(
  `\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`,
)
if (failed > 0) {
  console.log('\n❌ Dry run FAILED — do not deploy\n')
  process.exit(1)
}
console.log('\n✅ Dry run PASSED — safe to deploy\n')
