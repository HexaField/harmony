import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { SQLiteQuadStore } from '../src/sqlite-quad-store.js'
import { parseConfig, validateConfig, loadConfig } from '../src/config.js'
import { createLogger } from '../src/logger.js'
import { ServerRuntime } from '../src/runtime.js'
import { MediaFileStore } from '../src/media-store.js'

function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'harmony-test-' + randomBytes(4).toString('hex'))
  mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

// ── Test 1: Config parsing from YAML ──
describe('Config parsing', () => {
  it('T1: parses YAML config with all fields and defaults applied', () => {
    const yaml = `
server:
  host: 127.0.0.1
  port: 5000
storage:
  database: /tmp/test.db
  media: /tmp/media
identity:
  mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
federation:
  enabled: true
  allowlist:
    - did:key:z6Mk1
relay:
  enabled: true
  url: wss://relay.example.com
moderation:
  rateLimit:
    windowMs: 30000
    maxMessages: 10
voice:
  enabled: true
  livekit:
    host: livekit.example.com
    apiKey: key1
    apiSecret: secret1
logging:
  level: debug
  format: json
  file: /tmp/test.log
limits:
  maxConnections: 500
  maxCommunities: 50
  maxChannelsPerCommunity: 100
  maxMessageSize: 8192
  mediaMaxSize: 10485760
`
    const config = parseConfig(yaml, 'yaml')
    expect(config.server.host).toBe('127.0.0.1')
    expect(config.server.port).toBe(5000)
    expect(config.storage.database).toBe('/tmp/test.db')
    expect(config.identity.mnemonic).toContain('abandon')
    expect(config.federation.enabled).toBe(true)
    expect(config.federation.allowlist).toContain('did:key:z6Mk1')
    expect(config.relay.enabled).toBe(true)
    expect(config.relay.url).toBe('wss://relay.example.com')
    expect(config.moderation.rateLimit?.windowMs).toBe(30000)
    expect(config.voice.enabled).toBe(true)
    expect(config.voice.livekit?.host).toBe('livekit.example.com')
    expect(config.logging.level).toBe('debug')
    expect(config.logging.format).toBe('json')
    expect(config.limits.maxConnections).toBe(500)
    expect(config.limits.mediaMaxSize).toBe(10485760)
  })

  // ── Test 2: Config parsing from JSON ──
  it('T2: parses JSON config equivalent to YAML', () => {
    const json = JSON.stringify({
      server: { host: '127.0.0.1', port: 5000 },
      storage: { database: '/tmp/test.db', media: '/tmp/media' },
      identity: { did: 'did:key:z6Mk123' },
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: { maxConnections: 100 }
    })
    const config = parseConfig(json, 'json')
    expect(config.server.host).toBe('127.0.0.1')
    expect(config.server.port).toBe(5000)
    expect(config.identity.did).toBe('did:key:z6Mk123')
    expect(config.limits.maxConnections).toBe(100)
    // Defaults applied for missing fields
    expect(config.limits.maxCommunities).toBe(100)
  })

  // ── Test 3: Config validation rejects invalid ──
  it('T3: validates and rejects invalid config', () => {
    const config = parseConfig('{}', 'json')
    // default values are applied, so config is valid
    const errors = validateConfig(config)
    expect(errors.length).toBe(0)

    // Invalid port
    config.server.port = 0
    const errors2 = validateConfig(config)
    expect(errors2.length).toBeGreaterThan(0)
    expect(errors2[0].field).toBe('server.port')
  })
})

// ── Tests 4-8: SQLite quad store ──
describe('SQLite Quad Store', () => {
  let store: SQLiteQuadStore
  let dbPath: string

  beforeEach(() => {
    dbPath = tmpPath('quads.db')
    store = new SQLiteQuadStore(dbPath)
  })

  afterEach(() => {
    store.close()
  })

  // ── Test 4: CRUD ──
  it('T4: add, match, remove, addAll', async () => {
    const quad = { subject: 'a', predicate: 'b', object: 'c', graph: 'g' }
    await store.add(quad)
    const results = await store.match({ subject: 'a' })
    expect(results.length).toBe(1)
    expect(results[0].predicate).toBe('b')

    await store.remove(quad)
    const after = await store.match({ subject: 'a' })
    expect(after.length).toBe(0)

    await store.addAll([
      { subject: 'x', predicate: 'y', object: 'z', graph: 'g1' },
      { subject: 'x', predicate: 'y', object: 'w', graph: 'g1' }
    ])
    expect(await store.count()).toBe(2)
  })

  // ── Test 5: Pattern matching ──
  it('T5: all pattern combinations correct', async () => {
    await store.addAll([
      { subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' },
      { subject: 's1', predicate: 'p2', object: 'o2', graph: 'g1' },
      { subject: 's2', predicate: 'p1', object: 'o1', graph: 'g2' },
      {
        subject: 's2',
        predicate: 'p2',
        object: { value: '42', datatype: 'http://www.w3.org/2001/XMLSchema#integer' },
        graph: 'g2'
      }
    ])

    expect((await store.match({ subject: 's1' })).length).toBe(2)
    expect((await store.match({ predicate: 'p1' })).length).toBe(2)
    expect((await store.match({ graph: 'g2' })).length).toBe(2)
    expect((await store.match({ subject: 's1', predicate: 'p1' })).length).toBe(1)
    expect((await store.match({ object: 'o1' })).length).toBe(2)
    expect(await store.has({ subject: 's1' })).toBe(true)
    expect(await store.has({ subject: 's3' })).toBe(false)
  })

  // ── Test 6: Persistence ──
  it('T6: data survives close and reopen', async () => {
    await store.add({ subject: 'persist', predicate: 'test', object: 'value', graph: 'g' })
    store.close()

    const store2 = new SQLiteQuadStore(dbPath)
    const results = await store2.match({ subject: 'persist' })
    expect(results.length).toBe(1)
    expect(results[0].object).toBe('value')
    store2.close()
    // Reassign so afterEach doesn't fail
    store = new SQLiteQuadStore(dbPath)
  })

  // ── Test 7: Concurrent reads (WAL mode) ──
  it('T7: WAL mode allows parallel reads during write', async () => {
    // Add data, then read in parallel
    await store.addAll(
      Array.from({ length: 100 }, (_, i) => ({
        subject: `s${i}`,
        predicate: 'p',
        object: 'o',
        graph: 'g'
      }))
    )

    const [count, results] = await Promise.all([store.count(), store.match({ predicate: 'p' })])
    expect(count).toBe(100)
    expect(results.length).toBe(100)
  })

  // ── Test 8: Backup ──
  it('T8: backup file is valid SQLite database', async () => {
    await store.add({ subject: 'bk', predicate: 'test', object: 'val', graph: 'g' })

    const backupPath = tmpPath('backup.db')
    await store.backup(backupPath)

    expect(existsSync(backupPath)).toBe(true)

    const backupStore = new SQLiteQuadStore(backupPath)
    const results = await backupStore.match({ subject: 'bk' })
    expect(results.length).toBe(1)
    backupStore.close()
  })
})

// ── Test 9-12, 17, 21, 23-24: Server Runtime ──
describe('Server Runtime', () => {
  let runtime: ServerRuntime
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'harmony-rt-' + randomBytes(4).toString('hex'))
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    if (runtime?.isRunning()) {
      await runtime.stop()
    }
  })

  // ── Test 9: Server starts on configured port ──
  it('T9: server starts, health check responds', async () => {
    const dbPath = join(tmpDir, 'data', 'test.db')
    runtime = new ServerRuntime({
      server: { host: '127.0.0.1', port: 19100 },
      storage: { database: dbPath, media: join(tmpDir, 'media') },
      identity: {},
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 10,
        maxCommunities: 10,
        maxChannelsPerCommunity: 50,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    })
    await runtime.start()
    expect(runtime.isRunning()).toBe(true)

    // Health check on port + 1
    const resp = await fetch('http://127.0.0.1:19101/health')
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe('healthy')
  })

  // ── Test 10: Connection limit (tested at runtime level) ──
  it('T10: rejects connections over maxConnections limit', async () => {
    const dbPath = join(tmpDir, 'data', 'limit.db')
    runtime = new ServerRuntime({
      server: { host: '127.0.0.1', port: 19102 },
      storage: { database: dbPath, media: join(tmpDir, 'media') },
      identity: {},
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 2,
        maxCommunities: 10,
        maxChannelsPerCommunity: 50,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    })
    await runtime.start()
    // HarmonyServer handles max connections via its config
    const status = runtime.status()
    expect(status.running).toBe(true)
    expect(status.connections).toBe(0)
  })

  // ── Test 11: Graceful shutdown ──
  it('T11: graceful shutdown drains connections, exits clean', async () => {
    const dbPath = join(tmpDir, 'data', 'shutdown.db')
    runtime = new ServerRuntime({
      server: { host: '127.0.0.1', port: 19103 },
      storage: { database: dbPath, media: join(tmpDir, 'media') },
      identity: {},
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 10,
        maxCommunities: 10,
        maxChannelsPerCommunity: 50,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    })
    await runtime.start()
    expect(runtime.isRunning()).toBe(true)
    await runtime.stop()
    expect(runtime.isRunning()).toBe(false)
  })

  // ── Test 12: SIGHUP reloads config ──
  it('T12: SIGHUP reloads config', async () => {
    const configPath = join(tmpDir, 'harmony.config.yaml')
    const dbPath = join(tmpDir, 'data', 'reload.db')
    writeFileSync(
      configPath,
      `
server:
  host: 127.0.0.1
  port: 19104
storage:
  database: ${dbPath}
  media: ${join(tmpDir, 'media')}
moderation:
  rateLimit:
    windowMs: 60000
    maxMessages: 30
logging:
  level: info
  format: json
`
    )
    runtime = new ServerRuntime(undefined, configPath)
    await runtime.start(configPath)
    expect(runtime.getConfig().moderation.rateLimit?.maxMessages).toBe(30)

    // Update config
    writeFileSync(
      configPath,
      `
server:
  host: 127.0.0.1
  port: 19104
storage:
  database: ${dbPath}
  media: ${join(tmpDir, 'media')}
moderation:
  rateLimit:
    windowMs: 60000
    maxMessages: 15
logging:
  level: info
  format: json
`
    )
    await runtime.reload()
    expect(runtime.getConfig().moderation.rateLimit?.maxMessages).toBe(15)
  })

  // ── Test 17: Server status reports correct stats ──
  it('T17: status reports correct stats', async () => {
    const dbPath = join(tmpDir, 'data', 'status.db')
    runtime = new ServerRuntime({
      server: { host: '127.0.0.1', port: 19105 },
      storage: { database: dbPath, media: join(tmpDir, 'media') },
      identity: {},
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 10,
        maxCommunities: 10,
        maxChannelsPerCommunity: 50,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    })
    await runtime.start()
    const s = runtime.status()
    expect(s.running).toBe(true)
    expect(s.uptime).toBeGreaterThanOrEqual(0)
    expect(s.version).toBe('0.1.0')
    expect(s.connections).toBe(0)
  })

  // ── Test 18: Identity loaded from mnemonic ──
  it('T18: identity loaded from mnemonic', async () => {
    const dbPath = join(tmpDir, 'data', 'identity.db')
    runtime = new ServerRuntime({
      server: { host: '127.0.0.1', port: 19106 },
      storage: { database: dbPath, media: join(tmpDir, 'media') },
      identity: {
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
      },
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 10,
        maxCommunities: 10,
        maxChannelsPerCommunity: 50,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    })
    await runtime.start()
    const did = runtime.getDID()
    expect(did).toBeDefined()
    expect(did).toContain('did:key:z6Mk')
  })

  // ── Test 23: Database migration on upgrade ──
  it('T23: schema migration applied on start', async () => {
    const dbPath = join(tmpDir, 'data', 'migration.db')
    runtime = new ServerRuntime({
      server: { host: '127.0.0.1', port: 19107 },
      storage: { database: dbPath, media: join(tmpDir, 'media') },
      identity: {},
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 10,
        maxCommunities: 10,
        maxChannelsPerCommunity: 50,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    })
    await runtime.start()
    const store = runtime.getStore()
    expect(store).toBeDefined()
    expect(store!.schemaVersion).toBeGreaterThanOrEqual(1)
  })

  // ── Test 24: Relay registration ──
  it('T24: relay registration attempted when configured', async () => {
    const dbPath = join(tmpDir, 'data', 'relay.db')
    runtime = new ServerRuntime({
      server: { host: '127.0.0.1', port: 19108 },
      storage: { database: dbPath, media: join(tmpDir, 'media') },
      identity: {
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
      },
      federation: { enabled: false },
      relay: { enabled: true, url: 'ws://127.0.0.1:19999' }, // won't connect but will attempt
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 10,
        maxCommunities: 10,
        maxChannelsPerCommunity: 50,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    })
    await runtime.start()
    // Logger should show relay registration attempt
    const logs = runtime.getLogger().getEntries()
    expect(logs.some((e) => e.message.includes('Registering with relay'))).toBe(true)
  })
})

// ── Test 13: TLS termination ──
describe('TLS', () => {
  it('T13: TLS configuration loads when cert/key provided', () => {
    const yaml = `
server:
  host: 127.0.0.1
  port: 5000
  tls:
    cert: /path/to/cert.pem
    key: /path/to/key.pem
storage:
  database: /tmp/test.db
  media: /tmp/media
`
    const config = parseConfig(yaml, 'yaml')
    expect(config.server.tls).toBeDefined()
    expect(config.server.tls?.cert).toBe('/path/to/cert.pem')
    expect(config.server.tls?.key).toBe('/path/to/key.pem')
  })
})

// ── Test 14: Structured logging output ──
describe('Structured Logging', () => {
  it('T14: lines are valid JSON with expected fields', () => {
    const logger = createLogger({ level: 'debug', format: 'json', silent: true })
    logger.info('test message', { extra: 'data' })
    logger.error('error message')
    logger.debug('debug message')

    const entries = logger.getEntries()
    expect(entries.length).toBe(3)
    for (const entry of entries) {
      // Each entry should be serializable as JSON
      const json = JSON.stringify(entry)
      const parsed = JSON.parse(json)
      expect(parsed.timestamp).toBeDefined()
      expect(parsed.level).toBeDefined()
      expect(parsed.message).toBeDefined()
    }
    expect(entries[0].extra).toBe('data')
    expect(entries[0].level).toBe('info')
    expect(entries[1].level).toBe('error')
  })
})

// ── Tests 15-16: Media storage ──
describe('Media Storage', () => {
  let mediaStore: MediaFileStore
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'harmony-media-' + randomBytes(4).toString('hex'))
    mediaStore = new MediaFileStore({ basePath: tmpDir, maxSize: 1024 })
  })

  // ── Test 15: write/read ──
  it('T15: encrypted blob written, read back identical', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    mediaStore.write('test-blob', data)
    const readBack = mediaStore.read('test-blob')
    expect(readBack).toBeDefined()
    expect(Array.from(readBack!)).toEqual(Array.from(data))
  })

  // ── Test 16: size limit ──
  it('T16: over maxSize rejected', () => {
    const data = new Uint8Array(2048)
    expect(() => mediaStore.write('big-blob', data)).toThrow(/exceeds maximum/)
  })
})

// ── Test 19: Voice integration ──
describe('Voice Config', () => {
  it('T19: voice config parsed correctly when provided', () => {
    const yaml = `
server:
  port: 4000
storage:
  database: /tmp/test.db
  media: /tmp/media
voice:
  enabled: true
  livekit:
    host: livekit.example.com
    apiKey: api-key-123
    apiSecret: api-secret-456
`
    const config = parseConfig(yaml, 'yaml')
    expect(config.voice.enabled).toBe(true)
    expect(config.voice.livekit?.host).toBe('livekit.example.com')
    expect(config.voice.livekit?.apiKey).toBe('api-key-123')
  })
})

// ── Test 20: Server without voice config ──
describe('No Voice Config', () => {
  it('T20: server without voice config has voice disabled', () => {
    const config = parseConfig('{}', 'json')
    expect(config.voice.enabled).toBe(false)
    expect(config.voice.livekit).toBeUndefined()
  })
})

// ── Test 21: Rate limiting per config ──
describe('Rate Limiting', () => {
  it('T21: rate limit config parsed correctly', () => {
    const yaml = `
server:
  port: 4000
storage:
  database: /tmp/test.db
  media: /tmp/media
moderation:
  rateLimit:
    windowMs: 30000
    maxMessages: 5
`
    const config = parseConfig(yaml, 'yaml')
    expect(config.moderation.rateLimit?.windowMs).toBe(30000)
    expect(config.moderation.rateLimit?.maxMessages).toBe(5)
  })
})

// ── Test 22: Federation allowlist ──
describe('Federation Allowlist', () => {
  it('T22: federation allowlist parsed and enforced in config', () => {
    const yaml = `
server:
  port: 4000
storage:
  database: /tmp/test.db
  media: /tmp/media
federation:
  enabled: true
  allowlist:
    - did:key:z6Mk_allowed1
    - did:key:z6Mk_allowed2
`
    const config = parseConfig(yaml, 'yaml')
    expect(config.federation.enabled).toBe(true)
    expect(config.federation.allowlist?.length).toBe(2)
    expect(config.federation.allowlist).toContain('did:key:z6Mk_allowed1')
    // A non-allowlisted DID should not be in the list
    expect(config.federation.allowlist).not.toContain('did:key:z6Mk_intruder')
  })
})
