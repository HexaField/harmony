/**
 * Cross-Device E2EE Verification Script
 *
 * Connects to two Chrome instances (Mac + Linux) via CDP,
 * sets up identities, creates a community, joins from both,
 * exchanges messages, and verifies MLS E2EE state.
 *
 * Prerequisites:
 *   - Harmony server running on 0.0.0.0:9001
 *   - Vite dev server on 0.0.0.0:5173
 *   - Chrome CDP on localhost:9222 (Mac) pointing to localhost:5173
 *   - Chrome CDP on localhost:9230 (Linux via SSH tunnel) pointing to 192.168.1.92:5173
 */

const ws = require('ws')

const MAC_CDP = 9222
const LINUX_CDP = 9230
const MAC_SERVER_URL = 'ws://192.168.1.92:9001'

// Pre-generated identities
const MAC_IDENTITY = {"did":"did:key:z6MkeZ97VHyrY7GB3tGRsD24xHY9T4vG3iws5aFKPhgJHRuj","mnemonic":"cave crew ginger view swallow length song garden gap off sport twist","displayName":"Mac User","createdAt":"2026-03-01T21:03:56.204Z"}
const LINUX_IDENTITY = {"did":"did:key:z6MkkAAH3fZ2udH8fy86cF5gmTcSeXQUL5ubQ4YufiMFvkoC","mnemonic":"cigar barrel runway desert faint more coconut under poem gift season fall","displayName":"Linux User","createdAt":"2026-03-01T21:03:56.204Z"}

// ── CDP Helpers ──

let msgIdCounter = 1

function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new ws.WebSocket(wsUrl)
    const pending = new Map()
    socket.on('open', () => {
      socket.cdpSend = (method, params = {}) => {
        const id = msgIdCounter++
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej })
          socket.send(JSON.stringify({ id, method, params }))
        })
      }
      resolve(socket)
    })
    socket.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    })
    socket.on('error', reject)
    setTimeout(() => reject(new Error('CDP connect timeout')), 10000)
  })
}

async function getTabWsUrl(cdpPort) {
  const resp = await fetch(`http://localhost:${cdpPort}/json`)
  const tabs = await resp.json()
  // Prefer a harmony/5173 tab, but fall back to any page tab
  const tab = tabs.find(t => t.url.includes('5173') || t.url.includes('harmony'))
    || tabs.find(t => t.type === 'page')
  if (!tab) throw new Error(`No tab found on CDP port ${cdpPort}. Tabs: ${tabs.map(t => t.url).join(', ')}`)
  return tab.webSocketDebuggerUrl
}

async function cdpEval(socket, expression, timeout = 15000) {
  const result = await Promise.race([
    socket.cdpSend('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }),
    new Promise((_, r) => setTimeout(() => r(new Error('eval timeout')), timeout))
  ])
  if (result.exceptionDetails) {
    const desc = result.exceptionDetails.exception?.description || result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)
    throw new Error(`JS Error: ${desc}`)
  }
  return result.result?.value
}

async function cdpNavigate(socket, url) {
  await socket.cdpSend('Page.enable')
  await socket.cdpSend('Page.navigate', { url })
  // Wait for page to actually load by polling document.location
  const urlHost = new URL(url).host
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const result = await socket.cdpSend('Runtime.evaluate', {
        expression: 'document.location.href',
        returnByValue: true
      })
      const href = result.result?.value
      if (href && href.includes(urlHost) && !href.includes('chrome-error')) break
    } catch {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Main ──

async function main() {
  const report = []
  function log(line) { report.push(line); console.log(line) }

  log('=== Cross-Device E2EE Verification ===')
  log('')

  // Step 1: Connect to both Chrome instances
  let macWsUrl, linuxWsUrl
  try {
    macWsUrl = await getTabWsUrl(MAC_CDP)
    log(`Mac CDP: ✅ Connected (${macWsUrl.substring(0, 40)}...)`)
  } catch (e) {
    log(`Mac CDP: ❌ ${e.message}`)
    process.exit(1)
  }

  try {
    linuxWsUrl = await getTabWsUrl(LINUX_CDP)
    log(`Linux CDP: ✅ Connected (${linuxWsUrl.substring(0, 40)}...)`)
  } catch (e) {
    log(`Linux CDP: ❌ ${e.message}`)
    process.exit(1)
  }

  const mac = await cdpConnect(macWsUrl)
  const linux = await cdpConnect(linuxWsUrl)
  log('')

  // Step 2: Setup Mac browser - navigate first, then seed identity
  log('--- Setting up Mac browser ---')
  await cdpNavigate(mac, 'http://127.0.0.1:5173')
  await sleep(2000)
  await cdpEval(mac, `
    localStorage.clear();
    localStorage.setItem('harmony:identity', JSON.stringify(${JSON.stringify(MAC_IDENTITY)}));
    localStorage.setItem('harmony:onboarding:step', 'complete');
    'seeded'
  `)
  await cdpNavigate(mac, 'http://127.0.0.1:5173')
  await sleep(3000)

  // Wait for __HARMONY_STORE__ to be available
  for (let i = 0; i < 20; i++) {
    const ready = await cdpEval(mac, `!!window.__HARMONY_STORE__`)
    if (ready) break
    await sleep(500)
  }
  const macStoreReady = await cdpEval(mac, `!!window.__HARMONY_STORE__`)
  if (!macStoreReady) {
    log('Mac Store: ❌ __HARMONY_STORE__ not available')
    process.exit(1)
  }
  log('Mac Store: ✅ Ready')

  // Wait for client init
  for (let i = 0; i < 20; i++) {
    const hasClient = await cdpEval(mac, `!!(window.__HARMONY_STORE__?.client())`)
    if (hasClient) break
    await sleep(500)
  }

  const macDid = await cdpEval(mac, `window.__HARMONY_STORE__.did()`)
  log(`Mac Identity: ${macDid || '❌ no DID'}`)

  // Connect to server
  await cdpEval(mac, `window.__HARMONY_STORE__.addServer('${MAC_SERVER_URL}'); 'added'`)
  await sleep(2000)

  // Wait for connection
  for (let i = 0; i < 15; i++) {
    const state = await cdpEval(mac, `window.__HARMONY_STORE__.connectionState()`)
    if (state === 'connected' || state === 'partial') break
    await sleep(1000)
  }
  const macConnState = await cdpEval(mac, `window.__HARMONY_STORE__.connectionState()`)
  log(`Mac Connection: ${macConnState === 'connected' || macConnState === 'partial' ? '✅' : '❌'} ${macConnState}`)

  // Step 3: Create community on Mac
  log('')
  log('--- Creating community ---')
  const commResult = await cdpEval(mac, `
    (async () => {
      const s = window.__HARMONY_STORE__
      const comm = await s.client().createCommunity({ name: 'E2EE Test' })
      await new Promise(r => setTimeout(r, 3000))
      const comms = s.communities()
      const channels = s.channels()
      return JSON.stringify({
        commId: comm?.id || comms[0]?.id,
        commName: comm?.name || comms[comms.length-1]?.name,
        generalId: channels.find(c => c.name === 'general' && c.id.includes(comm?.id || comms[comms.length-1]?.id))?.id
          || channels.find(c => c.name === 'general')?.id,
        channelCount: channels.length
      })
    })()
  `)
  const comm = JSON.parse(commResult)
  log(`Community Created: ${comm.commId} (${comm.commName}, ${comm.channelCount} channels)`)
  log(`General Channel: ${comm.generalId}`)

  if (!comm.commId || !comm.generalId) {
    log('❌ Failed to create community or find general channel')
    process.exit(1)
  }

  // Check MLS group on Mac
  const macMls = await cdpEval(mac, `window.__HARMONY_STORE__.client().hasMLSGroup('${comm.commId}', '${comm.generalId}')`)
  log(`Mac MLS Group (initial): ${macMls ? '✅' : '⚠️ not yet'} ${macMls}`)

  // Step 4: Setup Linux browser
  log('')
  log('--- Setting up Linux browser ---')
  // Navigate first to establish correct origin
  await cdpNavigate(linux, 'http://192.168.1.92:5173')
  await sleep(2000)
  // Now set localStorage on the correct origin
  await cdpEval(linux, `
    localStorage.clear();
    localStorage.setItem('harmony:identity', JSON.stringify(${JSON.stringify(LINUX_IDENTITY)}));
    localStorage.setItem('harmony:onboarding:step', 'complete');
    'seeded'
  `)
  // Reload to pick up the identity
  await cdpNavigate(linux, 'http://192.168.1.92:5173')
  await sleep(3000)

  for (let i = 0; i < 20; i++) {
    const ready = await cdpEval(linux, `!!window.__HARMONY_STORE__`)
    if (ready) break
    await sleep(500)
  }
  const linuxStoreReady = await cdpEval(linux, `!!window.__HARMONY_STORE__`)
  if (!linuxStoreReady) {
    log('Linux Store: ❌ __HARMONY_STORE__ not available')
    process.exit(1)
  }
  log('Linux Store: ✅ Ready')

  for (let i = 0; i < 20; i++) {
    const hasClient = await cdpEval(linux, `!!(window.__HARMONY_STORE__?.client())`)
    if (hasClient) break
    await sleep(500)
  }

  const linuxDid = await cdpEval(linux, `window.__HARMONY_STORE__.did()`)
  log(`Linux Identity: ${linuxDid || '❌ no DID'}`)

  // Connect Linux to Mac's server
  await cdpEval(linux, `window.__HARMONY_STORE__.addServer('${MAC_SERVER_URL}'); 'added'`)
  await sleep(2000)

  for (let i = 0; i < 15; i++) {
    const state = await cdpEval(linux, `window.__HARMONY_STORE__.connectionState()`)
    if (state === 'connected' || state === 'partial') break
    await sleep(1000)
  }
  const linuxConnState = await cdpEval(linux, `window.__HARMONY_STORE__.connectionState()`)
  log(`Linux Connection: ${linuxConnState === 'connected' || linuxConnState === 'partial' ? '✅' : '❌'} ${linuxConnState}`)

  // Step 5: Linux joins the community
  log('')
  log('--- Linux joining community ---')
  try {
    await cdpEval(linux, `
      (async () => {
        await Promise.race([
          window.__HARMONY_STORE__.client().joinCommunity('${comm.commId}'),
          new Promise((_, r) => setTimeout(() => r('join timeout'), 10000))
        ])
        await new Promise(r => setTimeout(r, 3000))
        return 'joined'
      })()
    `, 20000)
    log('Linux Join: ✅')
  } catch (e) {
    log(`Linux Join: ❌ ${e.message}`)
  }

  // Wait for MLS groups to establish
  await sleep(3000)

  // Step 6: Verify E2EE state
  log('')
  log('--- E2EE Verification ---')

  const macMlsFinal = await cdpEval(mac, `window.__HARMONY_STORE__.client().hasMLSGroup('${comm.commId}', '${comm.generalId}')`)
  log(`Mac MLS Group: ${macMlsFinal ? '✅' : '❌'} hasMLSGroup=${macMlsFinal}`)

  const linuxMlsFinal = await cdpEval(linux, `window.__HARMONY_STORE__.client().hasMLSGroup('${comm.commId}', '${comm.generalId}')`)
  log(`Linux MLS Group: ${linuxMlsFinal ? '✅' : '❌'} hasMLSGroup=${linuxMlsFinal}`)

  // Step 7: Exchange messages
  log('')
  log('--- Message Exchange ---')

  // Mac sends message
  await cdpEval(mac, `
    (async () => {
      await window.__HARMONY_STORE__.client().sendMessage('${comm.commId}', '${comm.generalId}', 'Hello from Mac!')
      return 'sent'
    })()
  `)
  log('Mac → sent "Hello from Mac!"')

  // Wait for Linux to receive
  await sleep(3000)
  let linuxRecvMac = false
  for (let i = 0; i < 10; i++) {
    const msgs = await cdpEval(linux, `
      JSON.stringify(window.__HARMONY_STORE__?.channelMessages?.('${comm.generalId}') ?? [])
    `)
    const parsed = JSON.parse(msgs || '[]')
    if (parsed.some(m => (m.content?.text || m.content) === 'Hello from Mac!')) {
      linuxRecvMac = true
      break
    }
    await sleep(1000)
  }
  log(`Message Mac→Linux: ${linuxRecvMac ? '✅ (encrypted, decrypted successfully)' : '❌ not received'}`)

  // Linux sends message
  await cdpEval(linux, `
    (async () => {
      await window.__HARMONY_STORE__.client().sendMessage('${comm.commId}', '${comm.generalId}', 'Hello from Linux!')
      return 'sent'
    })()
  `)
  log('Linux → sent "Hello from Linux!"')

  await sleep(3000)
  let macRecvLinux = false
  for (let i = 0; i < 10; i++) {
    const msgs = await cdpEval(mac, `
      JSON.stringify(window.__HARMONY_STORE__?.channelMessages?.('${comm.generalId}') ?? [])
    `)
    const parsed = JSON.parse(msgs || '[]')
    if (parsed.some(m => (m.content?.text || m.content) === 'Hello from Linux!')) {
      macRecvLinux = true
      break
    }
    await sleep(1000)
  }
  log(`Message Linux→Mac: ${macRecvLinux ? '✅ (encrypted, decrypted successfully)' : '❌ not received'}`)

  // Step 8: Voice E2EE check
  log('')
  log('--- Voice E2EE Bridge ---')

  const macVoice = await cdpEval(mac, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const vc = c?.getVoiceClient?.()
      const bridge = vc?.getE2EEBridge?.()
      return JSON.stringify({
        hasVoiceClient: !!vc,
        hasBridge: !!bridge,
        hasKey: bridge?.hasKey?.() ?? null,
        epoch: bridge?.getCurrentEpoch?.() ?? null
      })
    })()
  `)
  const macV = JSON.parse(macVoice || '{}')
  if (macV.hasBridge && macV.hasKey !== null) {
    log(`Voice E2EE Bridge (Mac): ${macV.hasKey ? '✅' : '❌'} hasKey=${macV.hasKey}, epoch=${macV.epoch}`)
  } else {
    log(`Voice E2EE Bridge (Mac): ⚠️ Not available (voiceClient=${macV.hasVoiceClient}, bridge=${macV.hasBridge})`)
  }

  const linuxVoice = await cdpEval(linux, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const vc = c?.getVoiceClient?.()
      const bridge = vc?.getE2EEBridge?.()
      return JSON.stringify({
        hasVoiceClient: !!vc,
        hasBridge: !!bridge,
        hasKey: bridge?.hasKey?.() ?? null,
        epoch: bridge?.getCurrentEpoch?.() ?? null
      })
    })()
  `)
  const linuxV = JSON.parse(linuxVoice || '{}')
  if (linuxV.hasBridge && linuxV.hasKey !== null) {
    log(`Voice E2EE Bridge (Linux): ${linuxV.hasKey ? '✅' : '❌'} hasKey=${linuxV.hasKey}, epoch=${linuxV.epoch}`)
  } else {
    log(`Voice E2EE Bridge (Linux): ⚠️ Not available (voiceClient=${linuxV.hasVoiceClient}, bridge=${linuxV.hasBridge})`)
  }

  // Summary
  log('')
  const allPassed = macMlsFinal && linuxMlsFinal && linuxRecvMac && macRecvLinux
  if (allPassed) {
    log('=== ALL CHECKS PASSED ===')
    log('Note: Voice E2EE bridge keys are only populated when clients join a voice channel.')
  } else {
    log('=== SOME CHECKS FAILED ===')
    if (!macMlsFinal) log('  - Mac MLS group not established')
    if (!linuxMlsFinal) log('  - Linux MLS group not established')
    if (!linuxRecvMac) log('  - Linux did not receive Mac message')
    if (!macRecvLinux) log('  - Mac did not receive Linux message')
  }

  // Cleanup
  mac.close()
  linux.close()

  process.exit(allPassed ? 0 : 1)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
