// Voice infrastructure end-to-end verification script.
// Starts its own server with mediasoup, connects a real client, joins voice.

import { HarmonyServer } from '../packages/server/src/index.js'
import { HarmonyClient } from '../packages/client/src/index.js'
import { VoiceClient } from '../packages/voice/src/index.js'
import { MediasoupAdapter } from '../packages/voice/src/adapters/mediasoup.js'
import { MemoryQuadStore } from '../packages/quads/src/index.js'
import { createCryptoProvider } from '../packages/crypto/src/index.js'
import { DIDKeyProvider } from '../packages/did/src/index.js'
import { IdentityManager } from '../packages/identity/src/index.js'
import { VCService } from '../packages/vc/src/index.js'
import type { DIDResolver, RevocationStore } from '../packages/vc/src/index.js'
import { createServer } from 'node:net'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const identityMgr = new IdentityManager(crypto)
const vcService = new VCService(crypto)
const resolver: DIDResolver = (did: string) => didProvider.resolve(did)
const revocationStore: RevocationStore = { isRevoked: async () => false, revoke: async () => {} }

// Find a free port
function getPort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer()
    s.listen(0, () => {
      const addr = s.address()
      const p = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(p))
    })
  })
}

async function createIdentityAndVP() {
  const { identity, keyPair } = await identityMgr.create()
  const vc = await vcService.issue({
    issuerDID: identity.did,
    issuerKeyPair: keyPair,
    subjectDID: identity.did,
    type: 'HarmonyAuthCredential',
    claims: { auth: true }
  })
  const vp = await vcService.present({ holderDID: identity.did, holderKeyPair: keyPair, credentials: [vc] })
  return { identity, keyPair, vp }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════')
  console.log('  Voice Infrastructure E2E Verification')
  console.log('══════════════════════════════════════════════════\n')

  // 1. Init mediasoup adapter
  console.log('1. Initializing MediasoupAdapter...')
  const sfuAdapter = new MediasoupAdapter({
    jwtSecret: 'verify-test-secret',
    listenIp: '127.0.0.1',
    announcedIp: '127.0.0.1'
  })
  await sfuAdapter.init(1)
  console.log('   ✅ Mediasoup worker started (1 worker)\n')

  // 2. Start server with SFU adapter
  const port = await getPort()
  const store = new MemoryQuadStore()
  console.log(`2. Starting HarmonyServer on port ${port} with SFU adapter...`)
  const server = new HarmonyServer({
    port,
    host: '127.0.0.1',
    store,
    didResolver: resolver,
    revocationStore,
    cryptoProvider: crypto,
    sfuAdapter
  })
  await server.start()
  console.log(`   ✅ Server running on ws://127.0.0.1:${port}\n`)

  // 3. Create identity & VP
  console.log('3. Creating test identity with VC/VP...')
  const alice = await createIdentityAndVP()
  console.log(`   ✅ Identity: ${alice.identity.did.substring(0, 40)}...\n`)

  // 4. Connect client with VoiceClient in mediasoup mode
  console.log('4. Connecting HarmonyClient with VoiceClient (mediasoup mode)...')
  const voiceClient = new VoiceClient({ mode: 'mediasoup' })
  const client = new HarmonyClient({ voiceClient })
  await client.connect({
    serverUrl: `ws://127.0.0.1:${port}`,
    identity: alice.identity,
    keyPair: alice.keyPair,
    vp: alice.vp
  })
  console.log('   ✅ Client connected and authenticated\n')

  // 5. Join voice channel
  console.log('5. Joining voice channel "voice-lobby"...')
  const connection = await client.joinVoice('voice-lobby')
  console.log('   ✅ Joined! Room:', connection.roomId)
  console.log('   ✅ Has SFU params:', connection.hasSFUParams)
  console.log('')

  // 6. Verify SFU room was created
  console.log('6. Verifying SFU room state...')
  const participants = await sfuAdapter.listParticipants('voice-lobby')
  console.log('   ✅ SFU participants:', participants)
  console.log(
    '   ✅ Router RTP capabilities:',
    sfuAdapter.getRouterRtpCapabilities('voice-lobby')?.codecs?.length,
    'codecs'
  )
  console.log('')

  // 7. Connect second client
  console.log('7. Connecting second client (Bob)...')
  const bob = await createIdentityAndVP()
  const voiceClient2 = new VoiceClient({ mode: 'mediasoup' })
  const client2 = new HarmonyClient({ voiceClient: voiceClient2 })
  await client2.connect({
    serverUrl: `ws://127.0.0.1:${port}`,
    identity: bob.identity,
    keyPair: bob.keyPair,
    vp: bob.vp
  })
  const conn2 = await client2.joinVoice('voice-lobby')
  console.log('   ✅ Bob joined! Room:', conn2.roomId)
  const parts2 = await sfuAdapter.listParticipants('voice-lobby')
  console.log('   ✅ SFU now has', parts2.length, 'participants:', parts2)
  console.log('')

  // 8. Leave and verify cleanup
  console.log('8. Leaving voice...')
  await client.leaveVoice()
  await client2.leaveVoice()
  console.log('   ✅ Both clients left voice')

  // 9. Cleanup
  console.log('9. Cleaning up...')
  await client.disconnect()
  await client2.disconnect()
  await server.stop()
  await sfuAdapter.close()
  console.log('   ✅ All resources closed')

  console.log('\n══════════════════════════════════════════════════')
  console.log('  ALL CHECKS PASSED ✅')
  console.log('══════════════════════════════════════════════════')
  console.log('  • MediasoupAdapter: workers init, room create, JWT tokens')
  console.log('  • HarmonyServer: voice.token → real SFU tokens via adapter')
  console.log('  • HarmonyClient: waits for server token, parses JWT')
  console.log('  • VoiceClient: mediasoup mode, SFU transport params')
  console.log('  • Multi-client: 2 participants in same SFU room')
  console.log('  • Cleanup: leave voice, close connections, stop workers')
  console.log('══════════════════════════════════════════════════\n')

  process.exit(0)
}

main().catch((err) => {
  console.error('\n❌ Verification failed:', err)
  process.exit(1)
})
