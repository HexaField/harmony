import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { VCService } from '@harmony/vc'

// @vitest-environment node

describe('Live Mac server WS join', () => {
  it('authenticates and joins community', async () => {
    const crypto = createCryptoProvider()
    const didProvider = new DIDKeyProvider(crypto)
    const kp = await crypto.generateSigningKeyPair()
    const didDoc = await didProvider.create(kp)
    const did = didDoc.id

    const vcSvc = new VCService(crypto)
    const vc = await vcSvc.issue({
      issuerDID: did,
      issuerKeyPair: kp,
      subjectDID: did,
      type: 'IdentityAssertion',
      claims: { type: 'IdentityAssertion' }
    })
    const vp = await vcSvc.present({
      holderDID: did,
      holderKeyPair: kp,
      credentials: [vc]
    })

    const result = await new Promise<{ auth: boolean; joined: boolean; channels: string[]; error?: string }>(
      (resolve) => {
        // Use native WebSocket (Node 22+)
        const ws = new WebSocket('ws://127.0.0.1:4515')
        let msgId = 1
        let auth = false,
          joined = false
        const channels: string[] = []
        let errorMsg = ''

        function send(type: string, payload: any) {
          ws.send(
            JSON.stringify({ id: `t-${msgId++}`, type, timestamp: new Date().toISOString(), sender: did, payload })
          )
        }

        ws.addEventListener('open', () => send('sync.state', vp))

        ws.addEventListener('message', (event: any) => {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
          console.log('←', msg.type, JSON.stringify(msg.payload || {}).substring(0, 150))

          if (msg.type === 'sync.response') {
            auth = true
            send('community.list', {})
          }
          if (msg.type === 'community.list.response' || msg.type === 'community.list') {
            const communities = msg.payload?.communities || []
            const id = communities[0]?.id || 'community:370ca5039b55327d6523a336faac4121'
            send('community.join', { communityId: id, membershipVC: {}, encryptionPublicKey: Array(32).fill(0) })
          }
          if (msg.type === 'community.updated') {
            joined = true
            for (const ch of msg.payload?.channels || []) channels.push(ch.name)
            ws.close()
            resolve({ auth, joined, channels })
          }
          if (msg.type === 'error') {
            errorMsg = msg.payload?.message || msg.payload?.code
            if (msg.payload?.code !== 'AUTH_REQUIRED') {
              ws.close()
              resolve({ auth, joined, channels, error: errorMsg })
            }
          }
        })

        ws.addEventListener('error', () => resolve({ auth, joined, channels, error: 'ws error' }))
        setTimeout(() => {
          ws.close()
          resolve({ auth, joined, channels, error: 'timeout' })
        }, 10000)
      }
    )

    console.log('Result:', result)
    expect(result.auth).toBe(true)
    expect(result.joined).toBe(true)
    expect(result.channels.length).toBeGreaterThan(0)
  }, 15000)
})
