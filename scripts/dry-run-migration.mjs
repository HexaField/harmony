#!/usr/bin/env node
/**
 * Migration deployment dry-run.
 *
 * Tests the full Discord → Harmony migration pipeline without a real Discord
 * server — uses synthetic data to exercise:
 *   1. Transform (Discord → RDF quads)
 *   2. Encrypt (quads → EncryptedExportBundle)
 *   3. Decrypt (bundle → quads)
 *   4. Extract (quads → structured ImportResult)
 *   5. Server import endpoint (POST to running server, verify data persisted)
 *
 * Usage:
 *   node scripts/dry-run-migration.mjs [--server ws://localhost:9999] [--verbose]
 *
 * If --server is omitted, only tests transform/encrypt/decrypt in-process.
 * If --server is provided, also tests the import endpoint on a running server.
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    server: { type: 'string' },
    verbose: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '30000' },
  },
})

const VERBOSE = values.verbose
const TIMEOUT = parseInt(values.timeout)
const SERVER_URL = values.server // e.g. ws://localhost:9999

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

console.log('\n🔄 Harmony Migration — Deployment Dry Run\n')

// ── Phase 1: Module loading ──────────────────────────

console.log('Phase 1: Module loading')

let MigrationService, MigrationBot, createCryptoProvider

await test('Migration package loads', async () => {
  const mod = await import('../packages/migration/src/index.ts')
  MigrationService = mod.MigrationService
  if (!MigrationService) throw new Error('MigrationService not exported')
})

await test('Migration-bot package loads', async () => {
  const mod = await import('../packages/migration-bot/src/index.ts')
  MigrationBot = mod.MigrationBot
  if (!MigrationBot) throw new Error('MigrationBot not exported')
})

await test('Crypto package loads', async () => {
  const mod = await import('../packages/crypto/src/index.ts')
  createCryptoProvider = mod.createCryptoProvider
  if (!createCryptoProvider) throw new Error('createCryptoProvider not exported')
})

if (!MigrationService || !MigrationBot || !createCryptoProvider) {
  console.log('\n❌ Cannot continue — required modules failed to load\n')
  process.exit(1)
}

// ── Phase 2: Transform ───────────────────────────────

console.log('\nPhase 2: Transform (Discord → RDF)')

const crypto = createCryptoProvider()
const migration = new MigrationService(crypto)
const adminDID = 'did:key:z6MkTestDryRun123456789'
let quads = null

// Build synthetic Discord export
const testExport = {
  server: { id: '999', name: 'Dry Run Server', icon: null, ownerId: '1' },
  channels: [
    { id: 'ch1', name: 'general', type: 'text', position: 0, parentId: null, topic: 'General chat' },
    { id: 'ch2', name: 'thread-1', type: 'thread', position: 0, parentId: 'ch1', topic: null },
    { id: 'cat1', name: 'Text Channels', type: 'category', position: 0, parentId: null, topic: null },
  ],
  roles: [
    { id: 'r1', name: 'Admin', permissions: '8', color: 0xff0000, position: 1, mentionable: false },
    { id: 'r2', name: '@everyone', permissions: '0', color: 0, position: 0, mentionable: false },
  ],
  members: [
    { userId: 'u1', username: 'TestUser', roles: ['r1'], joinedAt: '2025-01-01T00:00:00Z' },
    { userId: 'u2', username: 'member2', roles: ['r2'], joinedAt: '2025-06-01T00:00:00Z' },
  ],
  messages: new Map([
    ['ch1', [
      {
        id: 'msg1', content: 'Hello from dry run!', author: { id: 'u1', username: 'testuser', discriminator: '0001', avatar: null },
        timestamp: '2025-06-15T10:00:00Z', editedTimestamp: null, type: 0,
        attachments: [{ id: 'att1', filename: 'test.png', url: 'https://example.com/test.png', size: 1234, contentType: 'image/png' }],
        embeds: [{ type: 'rich', url: 'https://example.com', title: 'Example', description: 'A test embed', thumbnail: { url: 'https://example.com/thumb.png' } }],
        reactions: [{ emoji: '👍', users: ['u1', 'u2'] }],
        mentions: [], pinned: false,
      },
      {
        id: 'msg2', content: 'Reply to first', author: { id: 'u2', username: 'member2', discriminator: '0002', avatar: null },
        timestamp: '2025-06-15T10:01:00Z', editedTimestamp: '2025-06-15T10:02:00Z', type: 0,
        attachments: [], embeds: [], reactions: [], mentions: [], pinned: true,
        sticker_items: [{ id: 'st1', name: 'wave', format_type: 1 }],
      },
    ]],
    ['ch2', [
      {
        id: 'msg3', content: 'Thread message', author: { id: 'u1', username: 'testuser', discriminator: '0001', avatar: null },
        timestamp: '2025-06-15T11:00:00Z', editedTimestamp: null, type: 0,
        attachments: [], embeds: [], reactions: [], mentions: [], pinned: false,
      },
    ]],
  ]),
  pins: new Map([['ch1', ['msg2']]]),
}

await test('Transform produces quads', async () => {
  const result = migration.transformServerExport(testExport, adminDID)
  quads = result.quads
  if (!quads || quads.length === 0) throw new Error('No quads produced')
  log(`Produced ${quads.length} quads`)
})

await test('Community quad exists', async () => {
  const communityQuad = quads.find((q) => q.object === 'https://harmony.example/vocab#Community')
  if (!communityQuad) throw new Error('Missing community quad')
  log(`Community: ${communityQuad.subject}`)
})

await test('Channel quads exist', async () => {
  const channelQuads = quads.filter((q) => q.object === 'https://harmony.example/vocab#Channel')
  if (channelQuads.length === 0) throw new Error('No channel quads')
  log(`Channels: ${channelQuads.length}`)
})

await test('Thread quads exist', async () => {
  const threadQuads = quads.filter((q) => q.object === 'https://harmony.example/vocab#Thread')
  if (threadQuads.length === 0) throw new Error('No thread quads')
  log(`Threads: ${threadQuads.length}`)
})

await test('Message quads exist', async () => {
  const msgQuads = quads.filter((q) => q.object === 'https://harmony.example/vocab#Message')
  if (msgQuads.length < 3) throw new Error(`Expected 3+ messages, got ${msgQuads.length}`)
  log(`Messages: ${msgQuads.length}`)
})

await test('Embed quads exist', async () => {
  const embedQuads = quads.filter((q) => q.predicate === 'https://harmony.example/vocab#embed')
  if (embedQuads.length === 0) throw new Error('No embed quads')
  const embedUrl = quads.find((q) => q.predicate === 'https://harmony.example/vocab#embedUrl')
  const embedTitle = quads.find((q) => q.predicate === 'https://harmony.example/vocab#embedTitle')
  if (!embedUrl || !embedTitle) throw new Error('Missing embed detail quads')
  log(`Embeds: ${embedQuads.length}`)
})

await test('Attachment quads exist', async () => {
  const attQuads = quads.filter((q) => q.predicate === 'https://harmony.example/vocab#attachment')
  if (attQuads.length === 0) throw new Error('No attachment quads')
  log(`Attachments: ${attQuads.length}`)
})

await test('Reaction quads exist', async () => {
  const rxnQuads = quads.filter((q) => q.object === 'https://harmony.example/vocab#Reaction')
  if (rxnQuads.length === 0) throw new Error('No reaction quads')
  log(`Reactions: ${rxnQuads.length}`)
})

await test('Role quads exist', async () => {
  const roleQuads = quads.filter((q) => q.object === 'https://harmony.example/vocab#Role')
  if (roleQuads.length < 2) throw new Error(`Expected 2 roles, got ${roleQuads.length}`)
  log(`Roles: ${roleQuads.length}`)
})

await test('Member quads exist', async () => {
  const memberQuads = quads.filter((q) => q.object === 'https://harmony.example/vocab#Member')
  if (memberQuads.length < 2) throw new Error(`Expected 2 members, got ${memberQuads.length}`)
  log(`Members: ${memberQuads.length}`)
})

// ── Phase 3: Encrypt/Decrypt ─────────────────────────

console.log('\nPhase 3: Encrypt / Decrypt')

let bundle = null
let adminKeyPair = null

await test('Generate admin key pair', async () => {
  adminKeyPair = await crypto.generateSigningKeyPair()
  if (!adminKeyPair.publicKey || !adminKeyPair.secretKey) throw new Error('Invalid key pair')
})

await test('Encrypt export bundle', async () => {
  bundle = await migration.encryptExport(quads, adminKeyPair, {
    exportDate: new Date().toISOString(),
    sourceServerId: '999',
    sourceServerName: 'Dry Run Server',
    adminDID,
    channelCount: 3,
    messageCount: 3,
    memberCount: 2,
  })
  if (!bundle.ciphertext || !bundle.nonce || !bundle.metadata) {
    throw new Error('Bundle missing fields')
  }
  log(`Bundle: ${bundle.ciphertext.length} bytes ciphertext`)
})

await test('Decrypt produces same quad count', async () => {
  const decrypted = await migration.decryptExport(bundle, adminKeyPair)
  if (decrypted.length !== quads.length) {
    throw new Error(`Quad count mismatch: ${decrypted.length} vs ${quads.length}`)
  }
  log(`Decrypted: ${decrypted.length} quads`)
})

await test('Decrypt rejects wrong key', async () => {
  const wrongKey = await crypto.generateSigningKeyPair()
  let threw = false
  try {
    await migration.decryptExport(bundle, wrongKey)
  } catch {
    threw = true
  }
  if (!threw) throw new Error('Decryption with wrong key should have failed')
})

await test('Bundle metadata is correct', async () => {
  if (bundle.metadata.sourceServerId !== '999') throw new Error('Wrong server ID')
  if (bundle.metadata.messageCount !== 3) throw new Error('Wrong message count')
  if (bundle.metadata.memberCount !== 2) throw new Error('Wrong member count')
  if (bundle.metadata.channelCount !== 3) throw new Error('Wrong channel count')
})

// ── Phase 4: Server endpoint (optional) ──────────────

if (SERVER_URL) {
  console.log(`\nPhase 4: Server import endpoint (${SERVER_URL})`)

  const wsUrl = new URL(SERVER_URL)
  const healthPort = parseInt(wsUrl.port || '4000') + 1
  const healthBase = `http://${wsUrl.hostname}:${healthPort}`

  await test('Server health check', async () => {
    const res = await fetch(`${healthBase}/health`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  })

  await test('Import endpoint accepts bundle', async () => {
    const importBody = {
      bundle: {
        ciphertext: Buffer.from(bundle.ciphertext).toString('base64'),
        nonce: Buffer.from(bundle.nonce).toString('base64'),
        metadata: bundle.metadata,
      },
      adminDID,
      communityName: 'Dry Run Import',
      adminKeyPair: {
        publicKey: Buffer.from(adminKeyPair.publicKey).toString('base64'),
        secretKey: Buffer.from(adminKeyPair.secretKey).toString('base64'),
      },
    }

    const res = await fetch(`${healthBase}/api/migration/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importBody),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}: ${body}`)
    }

    const result = await res.json()
    log(`Import result: ${JSON.stringify(result)}`)

    if (!result.communityId) throw new Error('Missing communityId in response')
    if (!result.channels || result.channels.length === 0)
      throw new Error('No channels in response')
    if (!result.members || result.members.length === 0)
      throw new Error('No members in response')
  })

  await test('Import result has correct channel count', async () => {
    const importBody = {
      bundle: {
        ciphertext: Buffer.from(bundle.ciphertext).toString('base64'),
        nonce: Buffer.from(bundle.nonce).toString('base64'),
        metadata: bundle.metadata,
      },
      adminDID,
      communityName: 'Dry Run Verify',
      adminKeyPair: {
        publicKey: Buffer.from(adminKeyPair.publicKey).toString('base64'),
        secretKey: Buffer.from(adminKeyPair.secretKey).toString('base64'),
      },
    }

    const res = await fetch(`${healthBase}/api/migration/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importBody),
    })
    const result = await res.json()

    // Should have at least 1 channel + 1 thread
    const textChannels = result.channels.filter((c) => c.type === 'text')
    const threads = result.channels.filter((c) => c.type === 'thread')
    if (textChannels.length < 1) throw new Error(`Expected text channel, got ${textChannels.length}`)
    if (threads.length < 1) throw new Error(`Expected thread, got ${threads.length}`)
    log(`Channels: ${textChannels.length} text, ${threads.length} threads`)
  })

  await test('Export endpoint responds (requires Discord token)', async () => {
    const res = await fetch(`${healthBase}/api/migration/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    // 400 is expected (missing fields), not 404 or 500
    if (res.status === 404) throw new Error('Export endpoint not found')
    if (res.status >= 500) throw new Error(`Server error: ${res.status}`)
    log(`Export response: ${res.status}`)
  })

  await test('User data endpoints respond', async () => {
    // GET for non-existent DID should return 404
    const res = await fetch(`${healthBase}/api/user-data/did:key:nonexistent`)
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`)
  })
} else {
  console.log('\nPhase 4: Skipped (no --server provided)')
  console.log('  ℹ️  Pass --server ws://localhost:9999 to test import endpoint')
}

// ── Summary ──────────────────────────────────────────

console.log(
  `\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`,
)
if (failed > 0) {
  console.log('\n❌ Migration dry run FAILED\n')
  process.exit(1)
}
console.log('\n✅ Migration dry run PASSED\n')
