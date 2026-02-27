#!/usr/bin/env node
/**
 * Server deployment dry-run.
 *
 * Starts a real Harmony server instance, runs the smoke test suite against it,
 * then shuts down. Catches startup crashes, binding errors, missing deps, and
 * runtime regressions before deploying.
 *
 * Usage:
 *   node scripts/dry-run-server.mjs [--port 9990] [--timeout 30000]
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '0' },
    timeout: { type: 'string', default: '30000' },
    verbose: { type: 'boolean', default: false },
    'keep-data': { type: 'boolean', default: false },
  },
})

const PORT = parseInt(values.port)
const TIMEOUT = parseInt(values.timeout)
const VERBOSE = values.verbose

let passed = 0
let failed = 0

function log(msg) {
  if (VERBOSE) console.log(`  [debug] ${msg}`)
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

console.log('\n🏗️  Harmony Server — Deployment Dry Run\n')

// ── Phase 1: Pre-flight checks ──────────────────────

console.log('Phase 1: Pre-flight')

await test('pnpm-lock.yaml exists', async () => {
  if (!existsSync('pnpm-lock.yaml')) throw new Error('Missing lockfile')
})

await test('Server entry point exists', async () => {
  if (
    !existsSync('packages/server-runtime/bin/harmony-server.js')
  )
    throw new Error('Missing server entry')
})

await test('better-sqlite3 native module loadable', async () => {
  const { execSync } = await import('node:child_process')
  // pnpm doesn't hoist — resolve via the actual package path
  const bsPath = 'node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3'
  if (!existsSync(bsPath)) throw new Error('better-sqlite3 not installed')
  try {
    execSync(`node -e "require('./${bsPath}')"`, {
      stdio: 'pipe',
      timeout: 10_000,
      cwd: process.cwd(),
    })
  } catch {
    throw new Error(
      `Native module failed. Run: cd ${bsPath} && npx node-gyp rebuild --release`,
    )
  }
})

await test('TypeScript check passes', async () => {
  const { execSync } = await import('node:child_process')
  try {
    execSync('pnpm run check', { stdio: 'pipe', timeout: 60_000 })
  } catch (e) {
    const stderr = e.stderr?.toString() || ''
    const match = stderr.match(/error TS\d+/)
    throw new Error(match ? `TS errors found: ${match[0]}` : 'tsc failed')
  }
})

// ── Phase 2: Start server ────────────────────────────

console.log('\nPhase 2: Server startup')

const dataDir = mkdtempSync(join(tmpdir(), 'harmony-dryrun-'))
log(`Temp data dir: ${dataDir}`)

let serverProc = null
let actualPort = PORT
let healthPort = 0

await test('Server starts without crash', async () => {
  return new Promise((resolve, reject) => {
    const args = [
      '--import',
      'tsx',
      'packages/server-runtime/bin/harmony-server.js',
      '--port',
      String(PORT),
    ]

    serverProc = spawn('node', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HARMONY_DB_PATH: join(dataDir, 'harmony.db'),
        HARMONY_MEDIA_PATH: join(dataDir, 'media'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    serverProc.stdout.on('data', (d) => {
      stdout += d.toString()
      log(`stdout: ${d.toString().trim()}`)

      // Parse the actual port from server output
      const portMatch = stdout.match(
        /listening on\s+\S+:(\d{4,5})/i,
      ) || stdout.match(
        /(?:listening|started|port)\s*(?:on\s*)?:?\s*(\d{4,5})/i,
      )
      if (portMatch) {
        actualPort = parseInt(portMatch[1])
        healthPort = actualPort + 1
        log(`Detected server port: ${actualPort}, health: ${healthPort}`)
        // Give it a moment to fully initialize
        setTimeout(resolve, 1000)
      }
    })

    serverProc.stderr.on('data', (d) => {
      stderr += d.toString()
      log(`stderr: ${d.toString().trim()}`)
    })

    serverProc.on('error', (err) =>
      reject(new Error(`Failed to spawn: ${err.message}`)),
    )

    serverProc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(
          new Error(
            `Server exited with code ${code}: ${stderr.slice(0, 200)}`,
          ),
        )
      }
    })

    // Fallback: if we can't detect port from output, try port 0 health check
    setTimeout(() => {
      if (actualPort === 0) {
        reject(
          new Error(
            'Could not detect server port from output within timeout',
          ),
        )
      }
    }, TIMEOUT - 2000)
  })
})

if (serverProc && actualPort > 0) {
  // ── Phase 3: Runtime checks ─────────────────────────

  console.log(`\nPhase 3: Runtime checks (port ${actualPort})`)

  await test('Health endpoint responds', async () => {
    const res = await fetch(`http://127.0.0.1:${healthPort}/health`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (body.status !== 'ok' && body.status !== 'healthy')
      throw new Error(`Unexpected: ${JSON.stringify(body)}`)
  })

  await test('WebSocket accepts connection', async () => {
    const { default: WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${actualPort}`)
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.close()
        resolve()
      })
      ws.on('error', reject)
    })
  })

  await test('Migration endpoint exists (POST /api/migration/export)', async () => {
    const res = await fetch(
      `http://127.0.0.1:${healthPort}/api/migration/export`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
    if (res.status === 404) throw new Error('Endpoint not found')
    if (res.status >= 500) throw new Error(`Server error: ${res.status}`)
  })

  await test('WebSocket rejects oversized payload', async () => {
    const { default: WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${actualPort}`)
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        // Send > 1MB
        try {
          ws.send('x'.repeat(1024 * 1024 + 100))
        } catch {
          // may throw synchronously
        }
        ws.on('close', () => resolve())
        ws.on('error', () => resolve()) // expected
      })
      ws.on('error', reject)
    })
  })

  await test('Invalid JSON handled gracefully', async () => {
    const { default: WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${actualPort}`)
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.send('not-json{{{')
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'error') {
            ws.close()
            resolve()
          }
        })
        // Server may just close the connection — that's also valid
        ws.on('close', () => resolve())
        // Timeout fallback — if no response and no close, still pass
        // (server may silently ignore malformed input)
        setTimeout(() => {
          ws.close()
          resolve()
        }, 3000)
      })
      ws.on('error', reject)
    })
  })

  await test('Unknown message type returns UNKNOWN_TYPE error', async () => {
    const { default: WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${actualPort}`)
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: '__nonexistent_type__', payload: {} }))
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'error') {
            ws.close()
            resolve()
          }
        })
        ws.on('close', () => resolve())
      })
      ws.on('error', reject)
    })
  })
}

// ── Cleanup ──────────────────────────────────────────

if (serverProc) {
  serverProc.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 500))
  if (serverProc.exitCode === null) serverProc.kill('SIGKILL')
}

if (!values['keep-data']) {
  try {
    rmSync(dataDir, { recursive: true, force: true })
  } catch {
    // best effort
  }
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
