// Quick standalone server launcher for testing
import { ServerRuntime } from '../packages/server-runtime/src/index.ts'
const runtime = new ServerRuntime({
  server: { host: '0.0.0.0', port: 3100 },
  storage: { database: '/tmp/harmony-voice-test/harmony.db', media: '/tmp/harmony-voice-test/media' },
  identity: {},
  federation: { enabled: false },
  relay: { enabled: false },
  moderation: {},
  voice: { enabled: false },
  logging: { level: 'warn', format: 'text' },
  limits: { maxConnections: 100, maxCommunities: 50, maxChannelsPerCommunity: 100, maxMessageSize: 16384, mediaMaxSize: 52428800 }
})
await runtime.start()
console.log('Harmony server running on 0.0.0.0:3100')
setInterval(() => {}, 60000)
process.on('SIGTERM', async () => { await runtime.stop(); process.exit(0) })
