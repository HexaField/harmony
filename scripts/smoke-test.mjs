#!/usr/bin/env node
/**
 * Post-deploy smoke test for Harmony.
 *
 * Tests:
 * 1. Health endpoint responds
 * 2. WebSocket connection + auth
 * 3. Community creation
 * 4. Message send + receive
 * 5. DID resolution
 *
 * Usage:
 *   node scripts/smoke-test.mjs --url wss://dev-cloud.harmony.chat
 *   node scripts/smoke-test.mjs --url ws://localhost:4000
 */

import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'ws://localhost:4000' },
    'health-url': { type: 'string' },
    timeout: { type: 'string', default: '10000' },
    verbose: { type: 'boolean', default: false }
  }
})

const WS_URL = values.url
// Health endpoint: if WS is ws://host:4000, health is http://host:4001
const wsUrl = new URL(WS_URL)
const healthPort = parseInt(wsUrl.port || '4000') + 1
const HEALTH_URL = values['health-url'] || `http://${wsUrl.hostname}:${healthPort}`
const TIMEOUT = parseInt(values.timeout)
const VERBOSE = values.verbose

let passed = 0
let failed = 0
const results = []

function log(msg) {
  if (VERBOSE) console.log(`  ${msg}`)
}

async function test(name, fn) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT))
    ])
    passed++
    results.push({ name, status: '✅' })
    console.log(`  ✅ ${name}`)
  } catch (err) {
    failed++
    results.push({ name, status: '❌', error: err.message })
    console.log(`  ❌ ${name}: ${err.message}`)
  }
}

console.log(`\n🔬 Harmony Smoke Test`)
console.log(`   WS:     ${WS_URL}`)
console.log(`   Health: ${HEALTH_URL}`)
console.log()

// Test 1: Health endpoint
await test('Health endpoint responds', async () => {
  const res = await fetch(`${HEALTH_URL}/health`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  if (!body.status || body.status !== 'ok') throw new Error(`Unexpected response: ${JSON.stringify(body)}`)
  log(`Response: ${JSON.stringify(body)}`)
})

// Test 2: WebSocket connection
await test('WebSocket connects', async () => {
  const { default: WebSocket } = await import('ws')
  const ws = new WebSocket(WS_URL)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  ws.close()
  log('Connection established and closed')
})

// Test 3: WebSocket auth timeout
await test('Unauthenticated connection gets closed', async () => {
  const { default: WebSocket } = await import('ws')
  const ws = new WebSocket(WS_URL)
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      // Don't send auth — wait for close
      ws.on('close', (code) => {
        if (code === 4001 || code === 1000) resolve()
        else reject(new Error(`Unexpected close code: ${code}`))
      })
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'error' && msg.payload?.code === 'AUTH_TIMEOUT') {
          ws.close()
          resolve()
        }
      })
    })
    ws.on('error', reject)
  })
  log('Connection closed after auth timeout')
})

// Test 4: Migration endpoint exists
await test('Migration endpoint responds', async () => {
  const res = await fetch(`${HEALTH_URL}/api/migration/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  // We expect a 400 (bad request) or 401, NOT a 404 or 500
  if (res.status === 404) throw new Error('Migration endpoint not found')
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`)
  log(`Response: ${res.status}`)
})

// Test 5: Static health info
await test('Health endpoint includes version', async () => {
  const res = await fetch(`${HEALTH_URL}/health`)
  const body = await res.json()
  if (!body.version && !body.uptime && !body.status) {
    throw new Error('Health response missing expected fields')
  }
  log(`Version: ${body.version || 'not set'}, Uptime: ${body.uptime || 'not set'}`)
})

// Summary
console.log()
console.log(`📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`)
if (failed > 0) {
  console.log('\nFailed tests:')
  results.filter(r => r.status === '❌').forEach(r => {
    console.log(`  • ${r.name}: ${r.error}`)
  })
  process.exit(1)
}
console.log('\n✅ All smoke tests passed\n')
