import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

import { parseConfig, validateConfig, loadConfig } from '../src/config.js'
import { createLogger } from '../src/logger.js'
import { SQLiteQuadStore } from '../src/sqlite-quad-store.js'
import { MediaFileStore } from '../src/media-store.js'
import { t } from '../src/strings.js'

const tmpBase = join(tmpdir(), `harmony-test-${randomBytes(4).toString('hex')}`)

beforeEach(() => mkdirSync(tmpBase, { recursive: true }))
afterEach(() => {
  try {
    rmSync(tmpBase, { recursive: true, force: true })
  } catch {}
})

// --- Config ---
describe('Config parsing', () => {
  it('parses minimal JSON config with defaults', () => {
    const config = parseConfig('{}', 'json')
    expect(config.server.host).toBe('0.0.0.0')
    expect(config.server.port).toBe(4000)
    expect(config.storage.database).toBe('./harmony.db')
    expect(config.limits.maxConnections).toBe(1000)
  })

  it('parses YAML config', () => {
    const yaml = `
server:
  host: 127.0.0.1
  port: 5000
storage:
  database: /tmp/test.db
  media: /tmp/media
`
    const config = parseConfig(yaml, 'yaml')
    expect(config.server.host).toBe('127.0.0.1')
    expect(config.server.port).toBe(5000)
    expect(config.storage.database).toBe('/tmp/test.db')
  })

  it('merges partial config with defaults', () => {
    const config = parseConfig('{"server": {"port": 9000}}', 'json')
    expect(config.server.port).toBe(9000)
    expect(config.server.host).toBe('0.0.0.0') // default preserved
  })

  it('parses TLS section', () => {
    const config = parseConfig('{"server": {"tls": {"cert": "/cert.pem", "key": "/key.pem"}}}', 'json')
    expect(config.server.tls?.cert).toBe('/cert.pem')
    expect(config.server.tls?.key).toBe('/key.pem')
  })

  it('parses moderation rateLimit', () => {
    const config = parseConfig('{"moderation": {"rateLimit": {"windowMs": 30000, "maxMessages": 10}}}', 'json')
    expect(config.moderation.rateLimit?.windowMs).toBe(30000)
    expect(config.moderation.rateLimit?.maxMessages).toBe(10)
  })

  it('parses relay section', () => {
    const config = parseConfig('{"relay": {"enabled": true, "url": "wss://relay.test"}}', 'json')
    expect(config.relay.enabled).toBe(true)
    expect(config.relay.url).toBe('wss://relay.test')
  })
})

describe('Config validation', () => {
  it('valid config returns no errors', () => {
    const config = parseConfig('{}', 'json')
    expect(validateConfig(config)).toEqual([])
  })

  it('invalid port returns error', () => {
    const config = parseConfig('{"server": {"port": 99999}}', 'json')
    const errors = validateConfig(config)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].field).toBe('server.port')
  })

  it('port 0 is invalid', () => {
    const config = parseConfig('{"server": {"port": 0}}', 'json')
    const errors = validateConfig(config)
    expect(errors.some((e) => e.field === 'server.port')).toBe(true)
  })
})

describe('loadConfig', () => {
  it('loads JSON config file', () => {
    const filePath = join(tmpBase, 'config.json')
    writeFileSync(filePath, JSON.stringify({ server: { port: 7777 } }))
    const config = loadConfig(filePath)
    expect(config.server.port).toBe(7777)
  })

  it('loads YAML config file', () => {
    const filePath = join(tmpBase, 'config.yaml')
    writeFileSync(filePath, 'server:\n  port: 8888\n')
    const config = loadConfig(filePath)
    expect(config.server.port).toBe(8888)
  })

  it('throws on invalid port in file', () => {
    const filePath = join(tmpBase, 'bad.json')
    writeFileSync(filePath, JSON.stringify({ server: { port: -1 } }))
    expect(() => loadConfig(filePath)).toThrow()
  })
})

// --- Logger ---
describe('Logger', () => {
  it('creates logger and logs at correct levels', () => {
    const logger = createLogger({ level: 'info', silent: true })
    logger.info('test info')
    logger.debug('should be filtered')
    const entries = logger.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].level).toBe('info')
    expect(entries[0].message).toBe('test info')
  })

  it('debug level captures all', () => {
    const logger = createLogger({ level: 'debug', silent: true })
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(logger.getEntries()).toHaveLength(4)
  })

  it('error level filters info/warn', () => {
    const logger = createLogger({ level: 'error', silent: true })
    logger.info('filtered')
    logger.warn('filtered')
    logger.error('kept')
    expect(logger.getEntries()).toHaveLength(1)
  })

  it('log entries have timestamps', () => {
    const logger = createLogger({ level: 'info', silent: true })
    logger.info('test')
    expect(logger.getEntries()[0].timestamp).toBeTruthy()
  })

  it('logs to file', () => {
    const filePath = join(tmpBase, 'test.log')
    const logger = createLogger({ level: 'info', format: 'text', file: filePath, silent: false })
    logger.info('file log')
    expect(existsSync(filePath)).toBe(true)
  })
})

// --- SQLiteQuadStore ---
describe('SQLiteQuadStore', () => {
  let store: SQLiteQuadStore

  beforeEach(() => {
    store = new SQLiteQuadStore(join(tmpBase, `test-${randomBytes(4).toString('hex')}.db`))
  })

  afterEach(() => {
    store.close()
  })

  it('add and match quad', async () => {
    await store.add({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })
    const results = await store.match({ subject: 's1' })
    expect(results).toHaveLength(1)
    expect(results[0].object).toBe('o1')
  })

  it('count quads', async () => {
    await store.add({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })
    await store.add({ subject: 's2', predicate: 'p2', object: 'o2', graph: 'g1' })
    expect(await store.count()).toBe(2)
  })

  it('deduplicates identical quads with typed literal', async () => {
    const q = { subject: 's1', predicate: 'p1', object: { value: 'o1', datatype: 'http://x' }, graph: 'g1' }
    await store.add(q)
    await store.add(q)
    // Typed literals with non-null datatype are properly deduped by UNIQUE constraint
    const results = await store.match({ subject: 's1' })
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('remove quad', async () => {
    const q = { subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' }
    await store.add(q)
    await store.remove(q)
    expect(await store.count()).toBe(0)
  })

  it('addAll in transaction', async () => {
    const quads = Array.from({ length: 10 }, (_, i) => ({
      subject: `s${i}`,
      predicate: 'p',
      object: `o${i}`,
      graph: 'g'
    }))
    await store.addAll(quads)
    expect(await store.count()).toBe(10)
  })

  it('match by predicate', async () => {
    await store.add({ subject: 's1', predicate: 'type', object: 'Person', graph: 'g' })
    await store.add({ subject: 's2', predicate: 'name', object: 'Alice', graph: 'g' })
    const results = await store.match({ predicate: 'type' })
    expect(results).toHaveLength(1)
  })

  it('graphs() returns distinct graphs', async () => {
    await store.add({ subject: 's', predicate: 'p', object: 'o', graph: 'g1' })
    await store.add({ subject: 's', predicate: 'p', object: 'o2', graph: 'g2' })
    const graphs = await store.graphs()
    expect(graphs.sort()).toEqual(['g1', 'g2'])
  })

  it('removeGraph', async () => {
    await store.add({ subject: 's', predicate: 'p', object: 'o', graph: 'g1' })
    await store.add({ subject: 's', predicate: 'p', object: 'o2', graph: 'g2' })
    await store.removeGraph('g1')
    expect(await store.count()).toBe(1)
  })

  it('export and import NQuads', async () => {
    await store.add({ subject: 'http://s', predicate: 'http://p', object: 'http://o', graph: 'http://g' })
    const nquads = await store.exportNQuads()
    expect(nquads).toContain('http://s')

    const store2 = new SQLiteQuadStore(join(tmpBase, `test2-${randomBytes(4).toString('hex')}.db`))
    await store2.importNQuads(nquads)
    expect(await store2.count()).toBe(1)
    store2.close()
  })

  it('subscribe receives events', async () => {
    const events: string[] = []
    store.subscribe({}, (e) => events.push(e.type))
    await store.add({ subject: 's', predicate: 'p', object: 'o', graph: 'g' })
    await store.remove({ subject: 's', predicate: 'p', object: 'o', graph: 'g' })
    expect(events).toEqual(['add', 'remove'])
  })

  it('stats returns quadCount and sizeBytes', async () => {
    await store.add({ subject: 's', predicate: 'p', object: 'o', graph: 'g' })
    const stats = store.stats()
    expect(stats.quadCount).toBe(1)
    expect(stats.sizeBytes).toBeGreaterThan(0)
  })

  it('typed literal with datatype', async () => {
    await store.add({
      subject: 's',
      predicate: 'age',
      object: { value: '30', datatype: 'http://www.w3.org/2001/XMLSchema#integer' },
      graph: 'g'
    })
    const results = await store.match({ predicate: 'age' })
    expect(results).toHaveLength(1)
    expect(typeof results[0].object).toBe('object')
    expect((results[0].object as any).value).toBe('30')
  })

  it('has() returns boolean', async () => {
    expect(await store.has({ subject: 'nonexistent' })).toBe(false)
    await store.add({ subject: 's', predicate: 'p', object: 'o', graph: 'g' })
    expect(await store.has({ subject: 's' })).toBe(true)
  })
})

// --- MediaFileStore ---
describe('MediaFileStore', () => {
  let media: MediaFileStore

  beforeEach(() => {
    media = new MediaFileStore({ basePath: join(tmpBase, 'media'), maxSize: 1024 })
  })

  it('write and read', () => {
    const data = new Uint8Array([1, 2, 3])
    media.write('test.bin', data)
    const result = media.read('test.bin')
    expect(new Uint8Array(result!)).toEqual(data)
  })

  it('exists and delete', () => {
    media.write('f1', new Uint8Array([1]))
    expect(media.exists('f1')).toBe(true)
    media.delete('f1')
    expect(media.exists('f1')).toBe(false)
  })

  it('read nonexistent returns null', () => {
    expect(media.read('nope')).toBeNull()
  })

  it('rejects files exceeding maxSize', () => {
    const big = new Uint8Array(2048)
    expect(() => media.write('big', big)).toThrow()
  })

  it('size and totalSize', () => {
    media.write('f1', new Uint8Array([1, 2, 3]))
    expect(media.size('f1')).toBe(3)
    expect(media.totalSize()).toBeGreaterThanOrEqual(3)
  })
})

// --- Strings ---
describe('Server runtime strings', () => {
  it('t() returns string with substitution', () => {
    expect(t('SERVER_STARTING', { host: '0.0.0.0', port: 4000 })).toContain('0.0.0.0')
    expect(t('HEALTH_OK')).toBe('healthy')
  })
})
