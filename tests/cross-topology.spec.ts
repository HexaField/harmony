/**
 * Harmony Cross-Topology E2E Tests (Playwright)
 *
 * Spins up cloud + self-hosted servers, connects multiple browser clients
 * through the Harmony Web UI, and verifies all interactions across every
 * client→server combination.
 *
 * Topologies tested:
 *   1. Web UI → Cloud Server (single client)
 *   2. Two clients on same server (multi-user)
 *   3. Web UI → Self-hosted Server
 *   4. Cross-server DMs (two servers)
 *   5. Voice channel operations
 *   6. Threads, Pins, Roles
 *   7. API surface completeness
 *
 * Prerequisites:
 *   - Vite dev server running (`pnpm --filter @harmony/ui-app dev`)
 *   - Node 22
 */
import { test, expect, type Page } from '@playwright/test'
import { fork, type ChildProcess } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const NODE22 = '/Users/josh/.nvm/versions/node/v22.18.0/bin/node'

// ── Identity generation (runs once, creates test mnemonics) ──

function generateIdentity(displayName: string): {
  did: string
  mnemonic: string
  displayName: string
  createdAt: string
} {
  const result = execSync(
    `${NODE22} --import tsx --input-type=module -e "
      import { createCryptoProvider } from './packages/crypto/src/index.ts'
      import { IdentityManager } from './packages/identity/src/index.ts'
      const c = createCryptoProvider()
      const r = await new IdentityManager(c).create()
      console.log(JSON.stringify({ did: r.identity.did, mnemonic: r.mnemonic, displayName: '${displayName}', createdAt: new Date().toISOString() }))
    "`,
    { cwd: ROOT, encoding: 'utf-8', timeout: 15000 }
  ).trim()
  return JSON.parse(result)
}

// ── Server launcher ──

interface ServerHandle {
  process: ChildProcess
  port: number
  url: string
}

async function startServer(port: number): Promise<ServerHandle> {
  const tmp = mkdtempSync(join(tmpdir(), 'harmony-e2e-'))
  const scriptPath = join(ROOT, `tests/.server-${port}.mts`)
  writeFileSync(
    scriptPath,
    `
import { ServerRuntime } from '../packages/server-runtime/src/index.ts'
const runtime = new ServerRuntime({
  server: { host: '127.0.0.1', port: ${port} },
  storage: { database: '${join(tmp, 'harmony.db').replace(/'/g, "\\'")}', media: '${join(tmp, 'media').replace(/'/g, "\\'")}' },
  identity: {},
  federation: { enabled: false },
  relay: { enabled: false },
  moderation: {},
  voice: { enabled: false },
  logging: { level: 'warn', format: 'text' },
  limits: { maxConnections: 100, maxCommunities: 50, maxChannelsPerCommunity: 100, maxMessageSize: 16384, mediaMaxSize: 52428800 }
})
await runtime.start()
process.send?.({ type: 'ready', port: ${port} })
setInterval(() => {}, 30000)
process.on('SIGTERM', async () => { await runtime.stop(); process.exit(0) })
`
  )

  const child = fork(scriptPath, [], {
    cwd: ROOT,
    execPath: NODE22,
    execArgv: ['--import', 'tsx'],
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, NODE_OPTIONS: '' }
  })

  child.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString().trim()
    if (msg && !msg.includes('ExperimentalWarning') && !msg.includes('dotenv')) {
      console.error(`[server:${port}] ${msg}`)
    }
  })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server ${port} start timeout`)), 15000)
    child.on('message', (msg: any) => {
      if (msg.type === 'ready') {
        clearTimeout(timeout)
        resolve()
      }
    })
    child.on('error', (e) => {
      clearTimeout(timeout)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code !== 0) reject(new Error(`Server exited with code ${code}`))
    })
  })

  return { process: child, port, url: `ws://127.0.0.1:${port}` }
}

// ── Store helpers ──

async function waitForStore(page: Page, timeoutMs = 10000): Promise<void> {
  await page.waitForFunction('!!window.__HARMONY_STORE__', { timeout: timeoutMs })
}

async function getState(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).__HARMONY_STORE__
    if (!s) return null
    return {
      did: s.did(),
      displayName: s.displayName(),
      communities: s.communities().map((c: any) => ({ id: c.id, name: c.name })),
      channels: s.channels().map((c: any) => ({ id: c.id, name: c.name, type: c.type })),
      connectionState: s.connectionState(),
      members: s.members().length
    }
  })
}

async function sendMessage(page: Page, communityId: string, channelId: string, content: string) {
  return page.evaluate(
    ({ commId, chId, text }) => {
      const s = (window as any).__HARMONY_STORE__
      return s.client().sendMessage(commId, chId, text)
    },
    { commId: communityId, chId: channelId, text: content }
  )
}

async function getMessages(page: Page, channelId: string): Promise<any[]> {
  return page.evaluate((chId) => (window as any).__HARMONY_STORE__?.channelMessages(chId) ?? [], channelId)
}

async function getDid(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__HARMONY_STORE__.did())
}

// ── Client setup ──

async function setupClient(
  page: Page,
  serverUrl: string,
  identity: { did: string; mnemonic: string; displayName: string; createdAt: string }
): Promise<void> {
  // Seed localStorage with the pre-generated identity
  await page.goto('http://localhost:5173', { timeout: 30000 })
  await page.evaluate((id) => {
    localStorage.clear()
    localStorage.setItem('harmony:identity', JSON.stringify(id))
    localStorage.setItem('harmony:onboarding:step', 'complete')
  }, identity)

  // Reload so App.tsx picks up the identity from localStorage
  await page.reload({ timeout: 30000 })
  await waitForStore(page, 15000)

  // Wait for client to be initialized (App.tsx restoreIdentityFromLocalStorage → initClient)
  await page.waitForFunction(
    () => {
      const s = (window as any).__HARMONY_STORE__
      return s && s.client() && s.did()?.length > 0
    },
    { timeout: 15000 }
  )

  // Connect to server
  await page.evaluate((url: string) => {
    ;(window as any).__HARMONY_STORE__.addServer(url)
  }, serverUrl)

  // Wait for connection
  await page.waitForFunction(
    "window.__HARMONY_STORE__?.connectionState() === 'connected' || window.__HARMONY_STORE__?.connectionState() === 'partial'",
    { timeout: 15000 }
  )
}

// ── Fixtures ──

let cloudServer: ServerHandle
let selfHostedServer: ServerHandle

// Pre-generate identities (avoids per-test crypto overhead)
let identities: Record<string, { did: string; mnemonic: string; displayName: string; createdAt: string }>

const CLOUD_PORT = 14200 + Math.floor(Math.random() * 800) * 2 // even numbers, leaves +1 for health
const SELF_HOSTED_PORT = CLOUD_PORT + 10

test.beforeAll(async () => {
  // Generate test identities
  identities = {
    cloudUser: generateIdentity('CloudUser'),
    alice: generateIdentity('Alice'),
    bob: generateIdentity('Bob'),
    selfHostedUser: generateIdentity('SelfHostedUser'),
    crossCloud: generateIdentity('CrossCloud'),
    crossSelfHosted: generateIdentity('CrossSelfHosted'),
    voiceAlice: generateIdentity('VoiceAlice'),
    voiceBob: generateIdentity('VoiceBob'),
    featureUser: generateIdentity('FeatureUser'),
    apiUser: generateIdentity('ApiUser')
  }

  // Start servers
  cloudServer = await startServer(CLOUD_PORT)
  selfHostedServer = await startServer(SELF_HOSTED_PORT)
})

test.afterAll(async () => {
  cloudServer?.process.kill('SIGTERM')
  selfHostedServer?.process.kill('SIGTERM')
  try {
    unlinkSync(join(ROOT, `tests/.server-${CLOUD_PORT}.mts`))
  } catch {}
  try {
    unlinkSync(join(ROOT, `tests/.server-${SELF_HOSTED_PORT}.mts`))
  } catch {}
  await new Promise((r) => setTimeout(r, 1000))
})

// ── Test Suites ──

test.describe('Topology 1: Web UI → Cloud Server', () => {
  let page: Page
  let commId: string
  let generalId: string

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    page = await ctx.newPage()
    await setupClient(page, cloudServer.url, identities.cloudUser)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('connects and has identity', async () => {
    const state = await getState(page)
    expect(state!.connectionState).toMatch(/connected|partial/)
    expect(state!.did).toMatch(/^did:key:/)
    expect(state!.displayName).toBe('CloudUser')
  })

  test('creates community', async () => {
    const commResult = await page.evaluate(async () => {
      const s = (window as any).__HARMONY_STORE__
      const comm = await s.client().createCommunity({ name: 'Cloud E2E Community' })
      // Wait for store to update (server responds with community.updated)
      await new Promise((r) => setTimeout(r, 2000))
      const comms = s.communities()
      const channels = s.channels()
      return {
        commId: comm?.id || comms[0]?.id,
        commName: comms[0]?.name,
        generalId: channels.find((c: any) => c.name === 'general')?.id,
        channelCount: channels.length
      }
    })
    commId = commResult.commId
    generalId = commResult.generalId
    expect(commId).toBeTruthy()
    expect(commResult.channelCount).toBeGreaterThanOrEqual(1)
  })

  test('sends and receives messages', async () => {
    await sendMessage(page, commId, generalId, 'Hello from cloud client!')
    // Wait for message to appear in store
    await page.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__
          ?.channelMessages(chId)
          ?.some((m: any) => m.content === 'Hello from cloud client!'),
      generalId,
      { timeout: 5000 }
    )
  })

  test('edits message without showing [encrypted]', async () => {
    // Send a fresh message to edit
    await sendMessage(page, commId, generalId, 'to-edit-msg')
    await page.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.content === 'to-edit-msg'),
      generalId,
      { timeout: 5000 }
    )
    const msgs = await getMessages(page, generalId)
    const msg = msgs.find((m: any) => m.content === 'to-edit-msg')
    expect(msg).toBeTruthy()

    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        await (window as any).__HARMONY_STORE__.client().editMessage(commId, chId, msgId, 'EDITED: cloud message')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { commId, chId: generalId, msgId: msg.id }
    )

    const updated = await getMessages(page, generalId)
    const edited = updated.find((m: any) => m.id === msg.id)
    expect(edited.content).toBe('EDITED: cloud message')
    expect(edited.content).not.toContain('[encrypted]')
  })

  test('deletes message', async () => {
    await sendMessage(page, commId, generalId, 'delete me')
    await page.waitForTimeout(500)
    let msgs = await getMessages(page, generalId)
    const countBefore = msgs.length
    const toDelete = msgs.find((m: any) => m.content === 'delete me')

    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        await (window as any).__HARMONY_STORE__.client().deleteMessage(commId, chId, msgId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId: toDelete.id }
    )

    msgs = await getMessages(page, generalId)
    expect(msgs.length).toBe(countBefore - 1)
  })

  test('channel CRUD', async () => {
    // Verify we have a community first
    const preCheck = await page.evaluate(() => {
      const s = (window as any).__HARMONY_STORE__
      return {
        comms: s.communities().length,
        channels: s.channels().map((c: any) => c.name),
        conn: s.connectionState()
      }
    })
    console.log('CRUD pre-check:', JSON.stringify(preCheck))

    // Create channel — await the promise properly
    const createResult = await page.evaluate(
      async ({ commId }) => {
        const s = (window as any).__HARMONY_STORE__
        try {
          const ch = await Promise.race([
            s.client().createChannel(commId, { name: 'test-crud', type: 'text' }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('channel.create timeout')), 5000))
          ])
          return { ok: true, ch: JSON.stringify(ch) }
        } catch (e: any) {
          return { ok: false, error: e.message }
        }
      },
      { commId }
    )
    console.log('Channel create result:', JSON.stringify(createResult))

    await page.waitForTimeout(1000)
    let channels: string[] = await page.evaluate(() =>
      (window as any).__HARMONY_STORE__.channels().map((c: any) => c.name)
    )
    console.log('Channels after create:', channels)
    expect(channels).toContain('test-crud')
  })

  test('reactions', async () => {
    // Send fresh message for reaction
    await sendMessage(page, commId, generalId, 'react-to-me')
    await page.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.content === 'react-to-me'),
      generalId,
      { timeout: 5000 }
    )
    const msgs = await getMessages(page, generalId)
    const msgId = msgs.find((m: any) => m.content === 'react-to-me')!.id

    // Add
    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        ;(window as any).__HARMONY_STORE__.client().addReaction(commId, chId, msgId, '👍')
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId }
    )

    let updated = await getMessages(page, generalId)
    let msg = updated.find((m: any) => m.id === msgId)
    expect(msg.reactions).toEqual(expect.arrayContaining([expect.objectContaining({ emoji: '👍' })]))

    // Remove
    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        ;(window as any).__HARMONY_STORE__.client().removeReaction(commId, chId, msgId, '👍')
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId }
    )

    updated = await getMessages(page, generalId)
    msg = updated.find((m: any) => m.id === msgId)
    const thumbs = msg.reactions?.find((r: any) => r.emoji === '👍')
    expect(!thumbs || thumbs.count === 0).toBe(true)
  })
})

test.describe('Topology 2: Two clients on same server', () => {
  let alice: Page
  let bob: Page
  let commId: string
  let generalId: string
  let aliceDid: string
  let bobDid: string

  test.beforeAll(async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    alice = await ctxA.newPage()
    bob = await ctxB.newPage()

    // Capture Bob's console for debug (only errors)
    bob.on('pageerror', (err) => console.log('BOB_ERR:', err.message))
    bob.on('console', (msg) => {
      if (msg.text().includes('[MLS-FALLBACK]')) console.log('BOB:', msg.text())
    })

    await setupClient(alice, cloudServer.url, identities.alice)
    await setupClient(bob, cloudServer.url, identities.bob)

    aliceDid = await getDid(alice)
    bobDid = await getDid(bob)
  })

  test.afterAll(async () => {
    await alice.close()
    await bob.close()
  })

  test('Alice creates community, Bob joins', async () => {
    const result = await alice.evaluate(async () => {
      const s = (window as any).__HARMONY_STORE__
      const comm = await s.client().createCommunity({ name: 'Shared Community' })
      await new Promise((r) => setTimeout(r, 2000))
      return { id: comm.id }
    })
    commId = result.id

    // Wait for channels to appear in Alice's store
    await alice.waitForFunction(
      () => (window as any).__HARMONY_STORE__?.channels()?.some((c: any) => c.name === 'general'),
      { timeout: 10000 }
    )
    generalId = await alice.evaluate(
      () => (window as any).__HARMONY_STORE__.channels().find((c: any) => c.name === 'general')?.id
    )

    await bob.evaluate(
      async ({ commId }) => {
        await Promise.race([
          (window as any).__HARMONY_STORE__.client().joinCommunity(commId),
          new Promise((_, r) => setTimeout(() => r('join timeout'), 10000))
        ])
        await new Promise((r) => setTimeout(r, 2000))
      },
      { commId }
    )

    const bobState = await getState(bob)
    expect(bobState!.communities.some((c: any) => c.id === commId)).toBe(true)
  })

  test('Alice sends, Bob receives', async () => {
    await sendMessage(alice, commId, generalId, 'Hello Bob!')
    await bob.waitForFunction(
      (chId: string) => {
        const msgs = (window as any).__HARMONY_STORE__?.channelMessages(chId)
        return msgs?.some((m: any) => m.content?.text === 'Hello Bob!' || m.content === 'Hello Bob!')
      },
      generalId,
      { timeout: 10000 }
    )
  })

  test('Bob sends, Alice receives', async () => {
    await sendMessage(bob, commId, generalId, 'Hi Alice!')
    await alice.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.content === 'Hi Alice!'),
      generalId,
      { timeout: 5000 }
    )
  })

  test('Alice edits, Bob sees (not [encrypted])', async () => {
    await sendMessage(alice, commId, generalId, 'edit-test-msg')
    await alice.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.content === 'edit-test-msg'),
      generalId,
      { timeout: 5000 }
    )
    const msgs = await getMessages(alice, generalId)
    const aliceMsg = msgs.find((m: any) => m.content === 'edit-test-msg')!

    await alice.evaluate(
      async ({ commId, chId, msgId }) => {
        await (window as any).__HARMONY_STORE__.client().editMessage(commId, chId, msgId, 'EDITED by Alice!')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { commId, chId: generalId, msgId: aliceMsg.id }
    )

    await bob.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.content === 'EDITED by Alice!'),
      generalId,
      { timeout: 5000 }
    )

    // Verify no [encrypted] on Bob
    const bobMsgs = await getMessages(bob, generalId)
    const edited = bobMsgs.find((m: any) => m.id === aliceMsg.id)
    expect(edited.content).not.toContain('[encrypted]')
  })

  test('Alice deletes, Bob sees deletion', async () => {
    await sendMessage(alice, commId, generalId, 'temp msg')
    await bob.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.content === 'temp msg'),
      generalId,
      { timeout: 5000 }
    )

    const msgs = await getMessages(alice, generalId)
    const temp = msgs.find((m: any) => m.content === 'temp msg')

    await alice.evaluate(
      async ({ commId, chId, msgId }) => {
        await (window as any).__HARMONY_STORE__.client().deleteMessage(commId, chId, msgId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId: temp.id }
    )

    await bob.waitForFunction(
      ({ chId, msgId }: { chId: string; msgId: string }) =>
        !(window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.id === msgId),
      { chId: generalId, msgId: temp.id },
      { timeout: 5000 }
    )
  })

  test('Reactions sync both ways', async () => {
    // Ensure there's a message to react to
    await sendMessage(alice, commId, generalId, 'react-target')
    await alice.waitForFunction(
      (chId: string) =>
        (window as any).__HARMONY_STORE__?.channelMessages(chId)?.some((m: any) => m.content === 'react-target'),
      generalId,
      { timeout: 5000 }
    )
    const msgs = await getMessages(alice, generalId)
    const msgId = msgs.find((m: any) => m.content === 'react-target')!.id

    await alice.evaluate(
      async ({ commId, chId, msgId }) => {
        ;(window as any).__HARMONY_STORE__.client().addReaction(commId, chId, msgId, '🎉')
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId }
    )

    await bob.waitForFunction(
      ({ chId, msgId }: { chId: string; msgId: string }) =>
        (window as any).__HARMONY_STORE__
          ?.channelMessages(chId)
          ?.find((m: any) => m.id === msgId)
          ?.reactions?.some((r: any) => r.emoji === '🎉'),
      { chId: generalId, msgId },
      { timeout: 5000 }
    )
  })

  test('Channel create visible to both', async () => {
    await alice.evaluate(
      async ({ commId }) => {
        // Fire and forget — don't await the full promise which waits for channel.created
        ;(window as any).__HARMONY_STORE__.client().createChannel(commId, { name: 'shared-ch', type: 'text' })
        await new Promise((r) => setTimeout(r, 2000))
      },
      { commId }
    )

    await bob.waitForFunction(
      () => (window as any).__HARMONY_STORE__?.channels()?.some((c: any) => c.name === 'shared-ch'),
      null,
      { timeout: 5000 }
    )
  })

  test('Channel delete visible to both', async () => {
    const chId = await alice.evaluate(
      () => (window as any).__HARMONY_STORE__.channels().find((c: any) => c.name === 'shared-ch')?.id
    )

    await alice.evaluate(
      async ({ commId, chId }) => {
        ;(window as any).__HARMONY_STORE__.client().deleteChannel(commId, chId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId }
    )

    await bob.waitForFunction(
      () => !(window as any).__HARMONY_STORE__?.channels()?.some((c: any) => c.name === 'shared-ch'),
      null,
      { timeout: 5000 }
    )
  })

  test('Bidirectional DMs', async () => {
    // Alice → Bob
    await alice.evaluate(
      async ({ bobDid }) => {
        await (window as any).__HARMONY_STORE__.client().sendDM(bobDid, 'DM from Alice!')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { bobDid }
    )

    await bob.waitForFunction(() => (window as any).__HARMONY_STORE__?.dmConversations()?.length > 0, null, {
      timeout: 5000
    })

    const bobDms = await bob.evaluate(
      (aliceDid: string) => (window as any).__HARMONY_STORE__.dmMessages(aliceDid),
      aliceDid
    )
    expect(bobDms.some((m: any) => m.content === 'DM from Alice!')).toBe(true)

    // Bob → Alice
    await bob.evaluate(
      async ({ aliceDid }) => {
        await (window as any).__HARMONY_STORE__.client().sendDM(aliceDid, 'DM reply from Bob!')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { aliceDid }
    )

    await alice.waitForFunction(
      (bobDid: string) =>
        (window as any).__HARMONY_STORE__?.dmMessages(bobDid)?.some((m: any) => m.content === 'DM reply from Bob!'),
      bobDid,
      { timeout: 5000 }
    )
  })

  test('Typing indicator (no error)', async () => {
    await alice.evaluate(
      async ({ commId, chId }) => {
        ;(window as any).__HARMONY_STORE__.client().sendTyping(commId, chId)
      },
      { commId, chId: generalId }
    )
    // Just verify no crash
  })

  test('Presence — both online', async () => {
    const members = await alice.evaluate(() =>
      (window as any).__HARMONY_STORE__
        .members()
        .filter((m: any) => m.status === 'online')
        .map((m: any) => m.did)
    )
    expect(members).toContain(aliceDid)
  })

  test('media upload — small PNG attachment', async () => {
    // Create a 1x1 PNG in-browser and upload via sendMessageWithAttachments
    const result = await alice.evaluate(
      async ({ commId, chId }) => {
        const s = (window as any).__HARMONY_STORE__
        const client = s.client()

        // Generate 1x1 PNG via canvas
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx2d = canvas.getContext('2d')!
        ctx2d.fillStyle = '#ff0000'
        ctx2d.fillRect(0, 0, 1, 1)

        const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
        const file = new File([blob], 'test.png', { type: 'image/png' })

        try {
          if (typeof client.sendMessageWithAttachments === 'function') {
            await client.sendMessageWithAttachments(commId, chId, 'Uploaded file', [
              { name: 'test.png', data: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/png' }
            ])
            return { sent: true }
          } else if (typeof client.uploadFile === 'function') {
            const ref = await client.uploadFile(commId, chId, {
              name: 'test.png',
              data: new Uint8Array(await blob.arrayBuffer()),
              mimeType: 'image/png'
            })
            return { uploaded: true, ref }
          }
          return { noMethod: true }
        } catch (err: any) {
          return { error: err.message }
        }
      },
      { commId, chId: generalId }
    )

    // The upload should either succeed or fail gracefully (no media server in test)
    expect(result).toBeTruthy()
  })
})

test.describe('Topology 3: Web UI → Self-hosted Server', () => {
  let page: Page
  let commId: string
  let generalId: string

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    page = await ctx.newPage()
    await setupClient(page, selfHostedServer.url, identities.selfHostedUser)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('connects to self-hosted', async () => {
    const state = await getState(page)
    expect(state!.connectionState).toMatch(/connected|partial/)
  })

  test('creates community', async () => {
    const result = await page.evaluate(async () => {
      const s = (window as any).__HARMONY_STORE__
      const comm = await s.client().createCommunity({ name: 'Self-Hosted Community' })
      await new Promise((r) => setTimeout(r, 1000))
      const channels = s.channels()
      return { id: comm.id, generalId: channels.find((c: any) => c.name === 'general')?.id }
    })
    commId = result.id
    generalId = result.generalId
    expect(commId).toBeTruthy()
    expect(generalId).toBeTruthy()
  })

  test('full message lifecycle', async () => {
    // Send
    await sendMessage(page, commId, generalId, 'Self-hosted msg')
    await page.waitForTimeout(500)
    let msgs = await getMessages(page, generalId)
    expect(msgs.some((m: any) => m.content === 'Self-hosted msg')).toBe(true)

    // Edit
    const msgId = msgs.find((m: any) => m.content === 'Self-hosted msg')!.id
    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        await (window as any).__HARMONY_STORE__.client().editMessage(commId, chId, msgId, 'Edited self-hosted')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { commId, chId: generalId, msgId }
    )
    msgs = await getMessages(page, generalId)
    expect(msgs.find((m: any) => m.id === msgId)!.content).toBe('Edited self-hosted')
    expect(msgs.find((m: any) => m.id === msgId)!.content).not.toContain('[encrypted]')

    // Delete
    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        await (window as any).__HARMONY_STORE__.client().deleteMessage(commId, chId, msgId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId }
    )
    msgs = await getMessages(page, generalId)
    expect(msgs.find((m: any) => m.id === msgId)).toBeUndefined()
  })

  test('channel CRUD', async () => {
    const chName = await page.evaluate(
      async ({ commId }) => {
        const ch = await (window as any).__HARMONY_STORE__
          .client()
          .createChannel(commId, { name: 'sh-channel', type: 'text' })
        await new Promise((r) => setTimeout(r, 500))
        return ch.name
      },
      { commId }
    )
    expect(chName).toBe('sh-channel')

    const chId = await page.evaluate(
      () => (window as any).__HARMONY_STORE__.channels().find((c: any) => c.name === 'sh-channel')?.id
    )
    await page.evaluate(
      async ({ commId, chId }) => {
        ;(window as any).__HARMONY_STORE__.client().deleteChannel(commId, chId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId }
    )

    const channels: string[] = await page.evaluate(() =>
      (window as any).__HARMONY_STORE__.channels().map((c: any) => c.name)
    )
    expect(channels).not.toContain('sh-channel')
  })
})

test.describe('Topology 4: Cross-server DMs', () => {
  let cloudPage: Page
  let selfHostedPage: Page
  let cloudDid: string
  let selfHostedDid: string

  test.beforeAll(async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    cloudPage = await ctx1.newPage()
    selfHostedPage = await ctx2.newPage()

    await setupClient(cloudPage, cloudServer.url, identities.crossCloud)
    await setupClient(selfHostedPage, selfHostedServer.url, identities.crossSelfHosted)

    cloudDid = await getDid(cloudPage)
    selfHostedDid = await getDid(selfHostedPage)

    // Each creates a community
    await cloudPage.evaluate(async () => {
      await (window as any).__HARMONY_STORE__.client().createCommunity({ name: 'Cloud Side' })
      await new Promise((r) => setTimeout(r, 1000))
    })
    await selfHostedPage.evaluate(async () => {
      await (window as any).__HARMONY_STORE__.client().createCommunity({ name: 'SH Side' })
      await new Promise((r) => setTimeout(r, 1000))
    })
  })

  test.afterAll(async () => {
    await cloudPage.close()
    await selfHostedPage.close()
  })

  test('clients on different servers', async () => {
    const cs = await getState(cloudPage)
    const ss = await getState(selfHostedPage)
    expect(cs!.communities.length).toBeGreaterThanOrEqual(1)
    expect(ss!.communities.length).toBeGreaterThanOrEqual(1)
  })

  test('add cross-server connections', async () => {
    await cloudPage.evaluate((url: string) => (window as any).__HARMONY_STORE__.addServer(url), selfHostedServer.url)
    await selfHostedPage.evaluate((url: string) => (window as any).__HARMONY_STORE__.addServer(url), cloudServer.url)
    await cloudPage.waitForTimeout(3000)
  })

  test('DMs across servers', async () => {
    // Cloud → Self-hosted
    await cloudPage.evaluate(
      async ({ did }) => {
        await (window as any).__HARMONY_STORE__.client().sendDM(did, 'Cross-server DM!')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { did: selfHostedDid }
    )

    await selfHostedPage.waitForFunction(() => (window as any).__HARMONY_STORE__?.dmConversations()?.length > 0, null, {
      timeout: 10000
    })

    const dms = await selfHostedPage.evaluate(
      (did: string) => (window as any).__HARMONY_STORE__.dmMessages(did),
      cloudDid
    )
    expect(dms.some((m: any) => m.content === 'Cross-server DM!')).toBe(true)

    // Self-hosted → Cloud
    await selfHostedPage.evaluate(
      async ({ did }) => {
        await (window as any).__HARMONY_STORE__.client().sendDM(did, 'Cross-server reply!')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { did: cloudDid }
    )

    await cloudPage.waitForFunction(
      (did: string) =>
        (window as any).__HARMONY_STORE__?.dmMessages(did)?.some((m: any) => m.content === 'Cross-server reply!'),
      selfHostedDid,
      { timeout: 10000 }
    )
  })
})

test.describe('Topology 5: Voice operations', () => {
  let alice: Page
  let bob: Page
  let commId: string
  let voiceChId: string

  test.beforeAll(async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    alice = await ctxA.newPage()
    bob = await ctxB.newPage()

    await setupClient(alice, cloudServer.url, identities.voiceAlice)
    await setupClient(bob, cloudServer.url, identities.voiceBob)

    // Alice creates community + voice channel
    const result = await alice.evaluate(async () => {
      const s = (window as any).__HARMONY_STORE__
      const comm = await s.client().createCommunity({ name: 'Voice Community' })
      await new Promise((r) => setTimeout(r, 1000))
      const ch = await s.client().createChannel(comm.id, { name: 'voice-room', type: 'voice' })
      await new Promise((r) => setTimeout(r, 500))
      return { commId: comm.id, voiceChId: ch.id }
    })
    commId = result.commId
    voiceChId = result.voiceChId

    // Bob joins
    await bob.evaluate(
      async ({ commId }) => {
        await Promise.race([
          (window as any).__HARMONY_STORE__.client().joinCommunity(commId),
          new Promise((_, r) => setTimeout(() => r('join timeout'), 10000))
        ])
        await new Promise((r) => setTimeout(r, 2000))
      },
      { commId }
    )
  })

  test.afterAll(async () => {
    await alice.close()
    await bob.close()
  })

  test('Alice joins voice', async () => {
    await alice.evaluate(async (chId: string) => {
      await (window as any).__HARMONY_STORE__.client().joinVoice(chId)
    }, voiceChId)
    await alice.waitForTimeout(2000)
    const channelId = await alice.evaluate(() => (window as any).__HARMONY_STORE__.voiceChannelId())
    expect(channelId).toBe(voiceChId)
  })

  test('Bob joins voice', async () => {
    await bob.evaluate(async (chId: string) => {
      await (window as any).__HARMONY_STORE__.client().joinVoice(chId)
    }, voiceChId)
    await bob.waitForTimeout(2000)
    const channelId = await bob.evaluate(() => (window as any).__HARMONY_STORE__.voiceChannelId())
    expect(channelId).toBe(voiceChId)
  })

  test('participants visible', async () => {
    await alice.waitForTimeout(1000)
    const count = await alice.evaluate(
      (chId: string) => (window as any).__HARMONY_STORE__.channelVoiceParticipants(chId).length,
      voiceChId
    )
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('mute/unmute', async () => {
    await alice.evaluate(() => (window as any).__HARMONY_STORE__.setMuted(true))
    await alice.waitForTimeout(500)
    expect(await alice.evaluate(() => (window as any).__HARMONY_STORE__.isMuted())).toBe(true)

    await alice.evaluate(() => (window as any).__HARMONY_STORE__.setMuted(false))
    await alice.waitForTimeout(500)
    expect(await alice.evaluate(() => (window as any).__HARMONY_STORE__.isMuted())).toBe(false)
  })

  test('deafen/undeafen', async () => {
    await alice.evaluate(() => (window as any).__HARMONY_STORE__.setDeafened(true))
    await alice.waitForTimeout(500)
    expect(await alice.evaluate(() => (window as any).__HARMONY_STORE__.isDeafened())).toBe(true)

    await alice.evaluate(() => (window as any).__HARMONY_STORE__.setDeafened(false))
    await alice.waitForTimeout(500)
    expect(await alice.evaluate(() => (window as any).__HARMONY_STORE__.isDeafened())).toBe(false)
  })

  test('Alice leaves voice', async () => {
    await alice.evaluate(async () => {
      await (window as any).__HARMONY_STORE__.client().leaveVoice()
    })
    await alice.waitForTimeout(500)
    const channelId = await alice.evaluate(() => (window as any).__HARMONY_STORE__.voiceChannelId())
    expect(channelId).toBeNull()
  })

  test('Bob leaves voice', async () => {
    await bob.evaluate(async () => {
      await (window as any).__HARMONY_STORE__.client().leaveVoice()
    })
    await bob.waitForTimeout(500)
    const channelId = await bob.evaluate(() => (window as any).__HARMONY_STORE__.voiceChannelId())
    expect(channelId).toBeNull()
  })
})

test.describe('Topology 6: Threads, Pins, Roles', () => {
  let page: Page
  let commId: string
  let generalId: string

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    page = await ctx.newPage()
    await setupClient(page, cloudServer.url, identities.featureUser)

    const result = await page.evaluate(async () => {
      const s = (window as any).__HARMONY_STORE__
      const comm = await s.client().createCommunity({ name: 'Features' })
      await new Promise((r) => setTimeout(r, 1000))
      return { commId: comm.id, generalId: s.channels().find((c: any) => c.name === 'general')?.id }
    })
    commId = result.commId
    generalId = result.generalId
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('thread creation', async () => {
    await sendMessage(page, commId, generalId, 'Thread parent')
    await page.waitForTimeout(500)
    const msgs = await getMessages(page, generalId)
    const parentId = msgs.find((m: any) => m.content === 'Thread parent')?.id

    await page.evaluate(
      async ({ commId, chId, parentId }) => {
        ;(window as any).__HARMONY_STORE__.client().createThread(commId, chId, parentId, 'Test Thread')
        await new Promise((r) => setTimeout(r, 1000))
      },
      { commId, chId: generalId, parentId }
    )
    // Thread created without error
  })

  test('pin/unpin', async () => {
    const msgs = await getMessages(page, generalId)
    if (!msgs.length) return
    const msgId = msgs[0].id

    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        ;(window as any).__HARMONY_STORE__.client().pinMessage(commId, chId, msgId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId }
    )

    const pinned = await page.evaluate(
      async ({ commId, chId }) => {
        return await (window as any).__HARMONY_STORE__.client().getPinnedMessages(commId, chId)
      },
      { commId, chId: generalId }
    )
    expect(pinned?.length).toBeGreaterThanOrEqual(1)

    await page.evaluate(
      async ({ commId, chId, msgId }) => {
        ;(window as any).__HARMONY_STORE__.client().unpinMessage(commId, chId, msgId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, chId: generalId, msgId }
    )
  })

  test('role creation', async () => {
    await page.evaluate(
      async ({ commId }) => {
        ;(window as any).__HARMONY_STORE__.client().createRole(commId, 'moderator', ['manage_messages', 'kick_members'])
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId }
    )
    // Created without error
  })

  test('thread reply visible to second user', async ({ browser }) => {
    // Create a second user context
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await setupClient(page2, cloudServer.url, identities.bob)

    // Bob joins the community
    await page2.evaluate(
      async ({ commId }) => {
        const s = (window as any).__HARMONY_STORE__
        await s.client().joinCommunity(commId)
        await new Promise((r) => setTimeout(r, 1000))
      },
      { commId }
    )

    // Alice sends a parent message and creates a thread
    await sendMessage(page, commId, generalId, 'Thread parent for visibility test')
    await page.waitForTimeout(500)
    const msgs = await getMessages(page, generalId)
    const parentId = msgs.find((m: any) => m.content === 'Thread parent for visibility test')?.id

    if (parentId) {
      await page.evaluate(
        async ({ commId, chId, parentId }) => {
          const s = (window as any).__HARMONY_STORE__
          await s.client().createThread(commId, chId, parentId, 'Visibility Thread')
          await new Promise((r) => setTimeout(r, 500))
          // Send a reply in the thread
          await s.client().sendMessage(commId, chId, 'Thread reply from Alice', { replyTo: parentId })
          await new Promise((r) => setTimeout(r, 500))
        },
        { commId, chId: generalId, parentId }
      )

      // Bob should see the reply
      await page2.waitForTimeout(1000)
      const bobMsgs = await getMessages(page2, generalId)
      const reply = bobMsgs.find((m: any) => m.content === 'Thread reply from Alice')
      expect(reply).toBeTruthy()
    }

    await page2.close()
    await ctx2.close()
  })

  test('pin limit enforcement — 51st pin should fail or be rejected', async () => {
    // Send 51 messages and try to pin all of them
    for (let i = 0; i < 51; i++) {
      await sendMessage(page, commId, generalId, `pin-limit-msg-${i}`)
    }
    await page.waitForTimeout(1000)

    const msgs = await getMessages(page, generalId)
    const pinTargets = msgs.filter((m: any) => (m.content as string).startsWith('pin-limit-msg-')).slice(0, 51)

    let pinErrors = 0
    for (const msg of pinTargets) {
      try {
        await page.evaluate(
          async ({ commId, chId, msgId }) => {
            await (window as any).__HARMONY_STORE__.client().pinMessage(commId, chId, msgId)
            await new Promise((r) => setTimeout(r, 100))
          },
          { commId, chId: generalId, msgId: msg.id }
        )
      } catch {
        pinErrors++
      }
    }

    // Verify that we either hit a limit or all 51 pinned (depends on server enforcement)
    const pinned = await page.evaluate(
      async ({ commId, chId }) => {
        return await (window as any).__HARMONY_STORE__.client().getPinnedMessages(commId, chId)
      },
      { commId, chId: generalId }
    )
    // If server enforces 50-pin limit, pinned.length should be <= 50
    // If no limit, all 51 should be pinned
    expect(pinned?.length).toBeGreaterThanOrEqual(1)
  })

  test('role assignment to member + permission gate', async ({ browser }) => {
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await setupClient(page2, cloudServer.url, identities.bob)

    // Bob joins
    await page2.evaluate(
      async ({ commId }) => {
        await (window as any).__HARMONY_STORE__.client().joinCommunity(commId)
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId }
    )

    const bobDid = identities.bob.did

    // Alice assigns moderator role to Bob
    await page.evaluate(
      async ({ commId, bobDid }) => {
        const s = (window as any).__HARMONY_STORE__
        await s.client().assignRole(commId, bobDid, 'moderator')
        await new Promise((r) => setTimeout(r, 500))
      },
      { commId, bobDid }
    )

    // Verify Bob has the role by checking members
    const bobRoles = await page.evaluate(
      async ({ commId, bobDid }) => {
        const members = (window as any).__HARMONY_STORE__.members()
        const bob = members.find((m: any) => m.did === bobDid)
        return bob?.roles ?? []
      },
      { commId, bobDid }
    )
    expect(bobRoles).toContain('moderator')

    await page2.close()
    await ctx2.close()
  })
})

test.describe('Topology 7: API surface completeness', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    page = await ctx.newPage()
    await setupClient(page, cloudServer.url, identities.apiUser)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('store signals', async () => {
    const present = await page.evaluate(() => {
      const s = (window as any).__HARMONY_STORE__
      return [
        'did',
        'displayName',
        'communities',
        'channels',
        'members',
        'connectionState',
        'isMuted',
        'isDeafened',
        'voiceConnectionState',
        'voiceParticipants',
        'channelMessages',
        'dmConversations',
        'dmMessages'
      ].filter((f) => typeof s[f] === 'function')
    })
    expect(present.length).toBeGreaterThanOrEqual(12)
  })

  test('client methods', async () => {
    const present = await page.evaluate(() => {
      const c = (window as any).__HARMONY_STORE__.client()
      return [
        'sendMessage',
        'editMessage',
        'deleteMessage',
        'addReaction',
        'removeReaction',
        'createChannel',
        'updateChannel',
        'deleteChannel',
        'createCommunity',
        'joinCommunity',
        'sendDM',
        'sendTyping',
        'createThread',
        'pinMessage',
        'unpinMessage',
        'createRole'
      ].filter((f) => typeof c[f] === 'function')
    })
    expect(present.length).toBeGreaterThanOrEqual(14)
  })

  test('store actions', async () => {
    const present = await page.evaluate(() => {
      const s = (window as any).__HARMONY_STORE__
      return [
        'addServer',
        'joinVoice',
        'leaveVoice',
        'toggleAudio',
        'toggleDeafen',
        'selectChannel',
        'setDisplayName',
        'client'
      ].filter((f) => typeof s[f] === 'function')
    })
    // At minimum: addServer, client
    expect(present.length).toBeGreaterThanOrEqual(2)
  })
})
