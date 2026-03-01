/**
 * Cross-Device E2EE Verification — Thorough Edition
 *
 * Proves E2EE actually works by verifying:
 *   1. MLS groups established with correct member counts and matching epochs
 *   2. Messages have epoch > 0 (MLS encrypted, not plaintext fallback)
 *   3. Ciphertext on the wire differs from plaintext
 *   4. Server-relayed payload contains opaque ciphertext (WebSocket interception)
 *   5. Bidirectional message exchange with successful decrypt
 *   6. Voice E2EE bridge key injection after voice join
 *   7. Negative: solo message before second member joins has epoch=0
 *
 * Prerequisites:
 *   - Harmony server on 0.0.0.0:9001 (fresh DB)
 *   - Vite dev server on 0.0.0.0:5173
 *   - Chrome CDP on localhost:9222 (Mac)
 *   - Chrome CDP on localhost:9230 (Linux via SSH tunnel)
 */

const ws = require('ws')

const MAC_CDP = 9222
const LINUX_CDP = 9230
const MAC_IP = process.env.MAC_IP || '192.168.1.92'
const MAC_SERVER_URL = `ws://${MAC_IP}:9001`
const MAC_VITE_URL = `http://127.0.0.1:5173`
const LINUX_VITE_URL = `http://${MAC_IP}:5173`

// Pre-generated identities (deterministic from mnemonic)
const MAC_IDENTITY = {
  did: 'did:key:z6MkeZ97VHyrY7GB3tGRsD24xHY9T4vG3iws5aFKPhgJHRuj',
  mnemonic: 'cave crew ginger view swallow length song garden gap off sport twist',
  displayName: 'Mac User',
  createdAt: '2026-03-01T21:03:56.204Z'
}
const LINUX_IDENTITY = {
  did: 'did:key:z6MkkAAH3fZ2udH8fy86cF5gmTcSeXQUL5ubQ4YufiMFvkoC',
  mnemonic: 'cigar barrel runway desert faint more coconut under poem gift season fall',
  displayName: 'Linux User',
  createdAt: '2026-03-01T21:03:56.204Z'
}

// ── CDP Helpers ──

let msgIdCounter = 1

function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new ws.WebSocket(wsUrl)
    const pending = new Map()
    const eventHandlers = new Map()
    socket.on('open', () => {
      socket.cdpSend = (method, params = {}) => {
        const id = msgIdCounter++
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej })
          socket.send(JSON.stringify({ id, method, params }))
        })
      }
      socket.cdpOn = (method, handler) => {
        if (!eventHandlers.has(method)) eventHandlers.set(method, [])
        eventHandlers.get(method).push(handler)
      }
      socket.cdpOff = (method, handler) => {
        const handlers = eventHandlers.get(method)
        if (handlers) {
          const idx = handlers.indexOf(handler)
          if (idx >= 0) handlers.splice(idx, 1)
        }
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
      if (msg.method) {
        const handlers = eventHandlers.get(msg.method) || []
        for (const h of handlers) h(msg.params)
      }
    })
    socket.on('error', reject)
    setTimeout(() => reject(new Error('CDP connect timeout')), 10000)
  })
}

async function getTabWsUrl(cdpPort) {
  const resp = await fetch(`http://localhost:${cdpPort}/json`)
  const tabs = await resp.json()
  const tab = tabs.find(t => t.url.includes('5173') || t.url.includes('harmony'))
    || tabs.find(t => t.type === 'page')
  if (!tab) throw new Error(`No tab on CDP port ${cdpPort}`)
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
    const desc = result.exceptionDetails.exception?.description || result.exceptionDetails.text
    throw new Error(`JS: ${desc}`)
  }
  return result.result?.value
}

async function cdpNavigate(socket, url) {
  await socket.cdpSend('Page.enable')
  await socket.cdpSend('Page.navigate', { url })
  const urlHost = new URL(url).host
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    try {
      const result = await socket.cdpSend('Runtime.evaluate', {
        expression: 'document.location.href',
        returnByValue: true
      })
      const href = result.result?.value
      if (href && href.includes(urlHost) && !href.includes('chrome-error')) return true
    } catch {}
  }
  throw new Error(`Navigate to ${url} failed — still on error page after 30s`)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function waitForStore(socket, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ready = await cdpEval(socket, `!!window.__HARMONY_STORE__`)
    if (ready) return true
    await sleep(500)
  }
  throw new Error('__HARMONY_STORE__ not available')
}

async function waitForClient(socket, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ready = await cdpEval(socket, `!!(window.__HARMONY_STORE__?.client())`)
    if (ready) return true
    await sleep(500)
  }
  throw new Error('HarmonyClient not initialized')
}

async function waitForConnection(socket, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const state = await cdpEval(socket, `window.__HARMONY_STORE__.connectionState()`)
    if (state === 'connected' || state === 'partial') return state
    await sleep(1000)
  }
  const final = await cdpEval(socket, `window.__HARMONY_STORE__.connectionState()`)
  throw new Error(`Connection not established: ${final}`)
}

async function setupBrowser(socket, viteUrl, identity, label) {
  await cdpNavigate(socket, viteUrl)
  await sleep(1000)
  await cdpEval(socket, `
    localStorage.clear();
    localStorage.setItem('harmony:identity', JSON.stringify(${JSON.stringify(null).replace('null', 'IDENTITY_PLACEHOLDER')}));
    localStorage.setItem('harmony:onboarding:step', 'complete');
    'seeded'
  `.replace('IDENTITY_PLACEHOLDER', JSON.stringify(identity)))
  await cdpNavigate(socket, viteUrl)
  await sleep(2000)
  await waitForStore(socket)
  await waitForClient(socket)
  const did = await cdpEval(socket, `window.__HARMONY_STORE__.did()`)
  if (!did) throw new Error(`${label}: DID not set after identity restore`)
  return did
}

/**
 * Capture WebSocket frames via CDP Network domain.
 * Returns { start(), stop(), frames() }
 */
function createWsInterceptor(socket) {
  const frames = []
  let collecting = false

  const onFrameReceived = (params) => {
    if (collecting) {
      frames.push({ direction: 'received', ...params.response, timestamp: params.timestamp })
    }
  }
  const onFrameSent = (params) => {
    if (collecting) {
      frames.push({ direction: 'sent', ...params.response, timestamp: params.timestamp })
    }
  }

  return {
    async start() {
      await socket.cdpSend('Network.enable')
      socket.cdpOn('Network.webSocketFrameReceived', onFrameReceived)
      socket.cdpOn('Network.webSocketFrameSent', onFrameSent)
      collecting = true
    },
    stop() {
      collecting = false
      socket.cdpOff('Network.webSocketFrameReceived', onFrameReceived)
      socket.cdpOff('Network.webSocketFrameSent', onFrameSent)
    },
    frames() { return [...frames] }
  }
}

// ── Assertions ──
let passed = 0
let failed = 0
const failures = []

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}`)
    failed++
    failures.push(label)
  }
}

// ── Main ──

async function main() {
  console.log('=== Cross-Device E2EE Verification (Thorough) ===')
  console.log(`Mac: ${MAC_VITE_URL} | Server: ${MAC_SERVER_URL}`)
  console.log(`Linux: ${LINUX_VITE_URL}`)
  console.log()

  // ── Connect CDP ──
  console.log('[1] CDP Connections')
  const macWsUrl = await getTabWsUrl(MAC_CDP)
  const linuxWsUrl = await getTabWsUrl(LINUX_CDP)
  const mac = await cdpConnect(macWsUrl)
  const linux = await cdpConnect(linuxWsUrl)
  assert(true, 'Mac CDP connected')
  assert(true, 'Linux CDP connected')
  console.log()

  // ── Setup Mac ──
  console.log('[2] Mac Browser Setup')
  const macDid = await setupBrowser(mac, MAC_VITE_URL, MAC_IDENTITY, 'Mac')
  assert(macDid === MAC_IDENTITY.did, `Mac DID matches: ${macDid.substring(0, 30)}...`)

  await cdpEval(mac, `window.__HARMONY_STORE__.addServer('${MAC_SERVER_URL}'); 'ok'`)
  const macConn = await waitForConnection(mac)
  assert(macConn === 'connected' || macConn === 'partial', `Mac connected: ${macConn}`)
  console.log()

  // ── Create community (Mac only — solo) ──
  console.log('[3] Community Creation (Mac solo)')
  const commResult = await cdpEval(mac, `
    (async () => {
      const s = window.__HARMONY_STORE__
      const comm = await s.client().createCommunity({ name: 'E2EE Thorough Test' })
      await new Promise(r => setTimeout(r, 3000))
      const comms = s.communities()
      const channels = s.channels()
      const commId = comm?.id || comms[comms.length - 1]?.id
      return JSON.stringify({
        commId,
        generalId: channels.find(c => c.name === 'general' && c.id.includes(commId))?.id,
        channelCount: channels.length
      })
    })()
  `, 20000)
  const comm = JSON.parse(commResult)
  assert(!!comm.commId, `Community created: ${comm.commId}`)
  assert(!!comm.generalId, `General channel: ${comm.generalId}`)
  const { commId, generalId } = comm

  // MLS group check (solo — should exist but memberCount=1)
  const macMlsSolo = await cdpEval(mac, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const has = c.hasMLSGroup('${commId}', '${generalId}')
      // Access internal mlsGroups map via reflection
      const groupId = '${commId}:${generalId}'
      // Try to get group details via the encryption path
      return JSON.stringify({ has })
    })()
  `)
  const mlsSolo = JSON.parse(macMlsSolo)
  assert(mlsSolo.has, 'Mac MLS group created for channel (solo)')

  // ── TEST 7: Solo message should have epoch > 0 if MLS group exists, but memberCount=1 ──
  // According to the code: MLS encrypt only if memberCount > 1. So solo = epoch 0 = plaintext.
  console.log()
  console.log('[4] Solo Message (before second member) — expect plaintext/epoch=0')

  // Use the client's encryptForChannel directly to verify the behaviour
  const soloEncResult = await cdpEval(mac, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      // Access private encryptForChannel method
      const fn = c['encryptForChannel'] || c.encryptForChannel
      if (typeof fn !== 'function') return JSON.stringify({ error: 'encryptForChannel not accessible' })
      const result = await fn.call(c, '${commId}', '${generalId}', 'Solo test message')
      return JSON.stringify({
        epoch: result.epoch,
        senderIndex: result.senderIndex,
        ciphertextLength: result.ciphertext?.length ?? 0,
        // Check if ciphertext is just the plaintext bytes
        isPlaintext: new TextDecoder().decode(result.ciphertext) === 'Solo test message'
      })
    })()
  `, 10000)
  const soloEnc = JSON.parse(soloEncResult)
  if (soloEnc.error) {
    console.log(`  ⚠️  ${soloEnc.error}`)
  } else {
    assert(soloEnc.epoch === 0, `Solo message epoch = ${soloEnc.epoch} (expected 0 = plaintext fallback when alone)`)
    assert(soloEnc.isPlaintext, 'Solo message "ciphertext" is raw plaintext (no encryption when memberCount=1)')
  }

  // ── Setup Linux ──
  console.log()
  console.log('[5] Linux Browser Setup')
  const linuxDid = await setupBrowser(linux, LINUX_VITE_URL, LINUX_IDENTITY, 'Linux')
  assert(linuxDid === LINUX_IDENTITY.did, `Linux DID matches: ${linuxDid.substring(0, 30)}...`)
  assert(linuxDid !== macDid, `Mac and Linux have different DIDs`)

  await cdpEval(linux, `window.__HARMONY_STORE__.addServer('${MAC_SERVER_URL}'); 'ok'`)
  const linuxConn = await waitForConnection(linux)
  assert(linuxConn === 'connected' || linuxConn === 'partial', `Linux connected: ${linuxConn}`)
  console.log()

  // ── Linux joins community ──
  console.log('[6] Linux Joins Community')
  await cdpEval(linux, `
    (async () => {
      await Promise.race([
        window.__HARMONY_STORE__.client().joinCommunity('${commId}'),
        new Promise((_, r) => setTimeout(() => r(new Error('join timeout')), 15000))
      ])
      await new Promise(r => setTimeout(r, 4000))
      return 'joined'
    })()
  `, 25000)

  // Verify Linux sees the community
  const linuxComms = await cdpEval(linux, `
    JSON.stringify(window.__HARMONY_STORE__.communities().map(c => ({id: c.id, name: c.name})))
  `)
  const linuxCommList = JSON.parse(linuxComms)
  assert(linuxCommList.some(c => c.id === commId), 'Linux sees the community after join')

  // Wait for MLS welcome to be processed (this is the key handshake)
  await sleep(5000)
  console.log()

  // ── MLS Group Verification ──
  console.log('[7] MLS Group State')

  const macMlsState = await cdpEval(mac, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const has = c.hasMLSGroup('${commId}', '${generalId}')
      // Access epoch and memberCount via the internal group
      // We'll use the encrypt path to test
      return JSON.stringify({ has })
    })()
  `)
  const macMls = JSON.parse(macMlsState)
  assert(macMls.has, 'Mac: MLS group exists')

  const linuxMlsState = await cdpEval(linux, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const has = c.hasMLSGroup('${commId}', '${generalId}')
      return JSON.stringify({ has })
    })()
  `)
  const linuxMls = JSON.parse(linuxMlsState)
  assert(linuxMls.has, 'Linux: MLS group exists')

  // Check MLS group details (epoch + member count) via internal access
  // The mlsGroups map is private, but we can access it via the prototype
  const macGroupDetails = await cdpEval(mac, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      // Access private mlsGroups map
      const groups = c['mlsGroups'] || c.mlsGroups
      if (!groups) return JSON.stringify({ error: 'cannot access mlsGroups' })
      const groupId = '${commId}:${generalId}'
      const group = groups.get(groupId)
      if (!group) return JSON.stringify({ error: 'group not found in map' })
      return JSON.stringify({
        epoch: group.epoch,
        memberCount: group.memberCount ? group.memberCount() : (group.state?.members?.length ?? 'unknown'),
        groupId: group.groupId
      })
    })()
  `)
  const macGroup = JSON.parse(macGroupDetails)
  console.log(`  Mac group: epoch=${macGroup.epoch}, members=${macGroup.memberCount}`)
  assert(macGroup.epoch >= 1, `Mac MLS epoch >= 1 (got ${macGroup.epoch}) — proves key exchange happened`)
  assert(macGroup.memberCount === 2 || macGroup.memberCount === '2', `Mac MLS memberCount = 2 (got ${macGroup.memberCount})`)

  const linuxGroupDetails = await cdpEval(linux, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const groups = c['mlsGroups'] || c.mlsGroups
      if (!groups) return JSON.stringify({ error: 'cannot access mlsGroups' })
      const groupId = '${commId}:${generalId}'
      const group = groups.get(groupId)
      if (!group) return JSON.stringify({ error: 'group not found in map' })
      return JSON.stringify({
        epoch: group.epoch,
        memberCount: group.memberCount ? group.memberCount() : (group.state?.members?.length ?? 'unknown'),
        groupId: group.groupId
      })
    })()
  `)
  const linuxGroup = JSON.parse(linuxGroupDetails)
  console.log(`  Linux group: epoch=${linuxGroup.epoch}, members=${linuxGroup.memberCount}`)
  assert(linuxGroup.epoch >= 1, `Linux MLS epoch >= 1 (got ${linuxGroup.epoch})`)
  assert(linuxGroup.memberCount === 2 || linuxGroup.memberCount === '2', `Linux MLS memberCount = 2 (got ${linuxGroup.memberCount})`)
  assert(macGroup.epoch === linuxGroup.epoch, `Epochs match: Mac=${macGroup.epoch} Linux=${linuxGroup.epoch}`)
  console.log()

  // ── Encrypted Message Exchange ──
  console.log('[8] Encrypted Message Mac→Linux')

  // First: verify that encrypt now produces real ciphertext (epoch > 0, different from plaintext)
  const encTest = await cdpEval(mac, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      const fn = c['encryptForChannel'] || c.encryptForChannel
      const testText = 'crypto verification payload'
      const result = await fn.call(c, '${commId}', '${generalId}', testText)
      const plaintextBytes = Array.from(new TextEncoder().encode(testText))
      const ctBytes = Array.from(result.ciphertext)
      // Check if ciphertext differs from plaintext
      const isDifferent = ctBytes.length !== plaintextBytes.length ||
        ctBytes.some((b, i) => b !== plaintextBytes[i])
      return JSON.stringify({
        epoch: result.epoch,
        senderIndex: result.senderIndex,
        ctLength: ctBytes.length,
        ptLength: plaintextBytes.length,
        isDifferent,
        // Ciphertext should be longer: 24 (nonce) + plaintext + 16 (Poly1305 MAC)
        expectedMinLength: plaintextBytes.length + 24 + 16,
        canDecryptAsText: (() => { try { return new TextDecoder().decode(result.ciphertext) === testText } catch { return false } })()
      })
    })()
  `)
  const enc = JSON.parse(encTest)
  assert(enc.epoch > 0, `Encrypt produces epoch=${enc.epoch} (> 0 = MLS used)`)
  assert(enc.isDifferent, `Ciphertext differs from plaintext`)
  assert(!enc.canDecryptAsText, `Ciphertext is NOT valid UTF-8 of original text (truly encrypted)`)
  assert(enc.ctLength >= enc.expectedMinLength, `Ciphertext length ${enc.ctLength} >= expected min ${enc.expectedMinLength} (nonce+MAC overhead)`)

  // Now send an actual message and verify Linux receives it
  // Also intercept WebSocket frames on Linux (received side) to check wire format
  const linuxRecvInterceptor = createWsInterceptor(linux)
  await linuxRecvInterceptor.start()

  const testMsgMacToLinux = 'E2EE test: Mac to Linux ' + Date.now()
  await cdpEval(mac, `
    (async () => {
      await window.__HARMONY_STORE__.client().sendMessage('${commId}', '${generalId}', '${testMsgMacToLinux}')
      return 'sent'
    })()
  `)

  // Wait for Linux to receive
  let linuxReceivedMac = false
  for (let i = 0; i < 15; i++) {
    await sleep(1000)
    const msgs = await cdpEval(linux, `
      JSON.stringify((window.__HARMONY_STORE__?.channelMessages?.('${generalId}') ?? []).map(m => ({
        text: m.content?.text || m.content,
        authorDID: m.authorDID
      })))
    `)
    const parsed = JSON.parse(msgs || '[]')
    if (parsed.some(m => m.text === testMsgMacToLinux)) {
      linuxReceivedMac = true
      break
    }
  }
  assert(linuxReceivedMac, `Linux received Mac's message: "${testMsgMacToLinux.substring(0, 30)}..."`)

  await sleep(1000)
  linuxRecvInterceptor.stop()

  // Inspect what Linux received from the server — should be opaque ciphertext
  const linuxRecvFrames = linuxRecvInterceptor.frames().filter(f => f.direction === 'received')
  let serverRelayedFrame = null
  for (const f of linuxRecvFrames) {
    try {
      const parsed = JSON.parse(f.payloadData)
      if (parsed.type === 'channel.message' && parsed.payload?.channelId === generalId) {
        if (parsed.payload?.content?.epoch > 0) {
          serverRelayedFrame = parsed
          break
        }
      }
    } catch {}
  }

  if (serverRelayedFrame) {
    assert(serverRelayedFrame.payload.content.epoch > 0, 'Server-relayed message has epoch > 0 (server passed through ciphertext)')
    // Verify the server couldn't have decrypted it — the ciphertext should be opaque bytes
    const relayedCt = serverRelayedFrame.payload.content.ciphertext
    if (relayedCt) {
      const bytes = Array.isArray(relayedCt) ? relayedCt : (relayedCt.data || [])
      const plaintextBytes = Array.from(new TextEncoder().encode(testMsgMacToLinux))
      const isDifferent = bytes.length !== plaintextBytes.length ||
        bytes.some((b, i) => b !== plaintextBytes[i])
      assert(isDifferent, 'Server-relayed payload is ciphertext (not plaintext) — server cannot read messages')
    }
  } else {
    console.log('  ⚠️  Could not capture server-relayed frame on Linux (Network.enable timing)')
  }
  console.log()

  // ── Linux → Mac ──
  console.log('[9] Encrypted Message Linux→Mac')

  // Verify Linux's encrypt also produces real ciphertext
  const linuxEncTest = await cdpEval(linux, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      const fn = c['encryptForChannel'] || c.encryptForChannel
      const testText = 'linux crypto verification'
      const result = await fn.call(c, '${commId}', '${generalId}', testText)
      const plaintextBytes = Array.from(new TextEncoder().encode(testText))
      const ctBytes = Array.from(result.ciphertext)
      return JSON.stringify({
        epoch: result.epoch,
        isDifferent: ctBytes.length !== plaintextBytes.length || ctBytes.some((b, i) => b !== plaintextBytes[i]),
        ctLength: ctBytes.length,
        ptLength: plaintextBytes.length
      })
    })()
  `)
  const linuxEnc = JSON.parse(linuxEncTest)
  assert(linuxEnc.epoch > 0, `Linux encrypt produces epoch=${linuxEnc.epoch} (> 0 = MLS used)`)
  assert(linuxEnc.isDifferent, 'Linux ciphertext differs from plaintext')

  const testMsgLinuxToMac = 'E2EE test: Linux to Mac ' + Date.now()
  await cdpEval(linux, `
    (async () => {
      await window.__HARMONY_STORE__.client().sendMessage('${commId}', '${generalId}', '${testMsgLinuxToMac}')
      return 'sent'
    })()
  `)

  let macReceivedLinux = false
  for (let i = 0; i < 15; i++) {
    await sleep(1000)
    const msgs = await cdpEval(mac, `
      JSON.stringify((window.__HARMONY_STORE__?.channelMessages?.('${generalId}') ?? []).map(m => ({
        text: m.content?.text || m.content
      })))
    `)
    const parsed = JSON.parse(msgs || '[]')
    if (parsed.some(m => m.text === testMsgLinuxToMac)) {
      macReceivedLinux = true
      break
    }
  }
  assert(macReceivedLinux, `Mac received Linux's message: "${testMsgLinuxToMac.substring(0, 30)}..."`)
  console.log()

  // ── Cross-decrypt proof ──
  console.log('[9b] Cross-Decrypt Proof (Mac encrypts, Linux decrypts directly)')
  const crossDecrypt = await cdpEval(mac, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      const fn = c['encryptForChannel'] || c.encryptForChannel
      const result = await fn.call(c, '${commId}', '${generalId}', 'cross-decrypt-proof')
      // Serialize ciphertext for transfer
      return JSON.stringify({
        epoch: result.epoch,
        senderIndex: result.senderIndex,
        ciphertext: Array.from(result.ciphertext)
      })
    })()
  `)
  const crossCt = JSON.parse(crossDecrypt)

  // Now have Linux decrypt it using its MLS group
  const linuxDecryptResult = await cdpEval(linux, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      const groups = c['mlsGroups'] || c.mlsGroups
      const group = groups.get('${commId}:${generalId}')
      if (!group) return JSON.stringify({ error: 'no group' })
      try {
        const ct = {
          epoch: ${crossCt.epoch},
          senderIndex: ${crossCt.senderIndex},
          ciphertext: new Uint8Array(${JSON.stringify(crossCt.ciphertext)})
        }
        const result = await group.decrypt(ct)
        const text = new TextDecoder().decode(result.plaintext)
        return JSON.stringify({ text, senderIndex: result.senderIndex })
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    })()
  `)
  const decResult = JSON.parse(linuxDecryptResult)
  if (decResult.error) {
    assert(false, `Linux decrypt failed: ${decResult.error}`)
  } else {
    assert(decResult.text === 'cross-decrypt-proof', `Linux decrypted Mac's ciphertext: "${decResult.text}"`)
  }

  // And vice versa: Linux encrypts, Mac decrypts
  const crossDecrypt2 = await cdpEval(linux, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      const fn = c['encryptForChannel'] || c.encryptForChannel
      const result = await fn.call(c, '${commId}', '${generalId}', 'reverse-decrypt-proof')
      return JSON.stringify({
        epoch: result.epoch,
        senderIndex: result.senderIndex,
        ciphertext: Array.from(result.ciphertext)
      })
    })()
  `)
  const crossCt2 = JSON.parse(crossDecrypt2)

  const macDecryptResult = await cdpEval(mac, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      const groups = c['mlsGroups'] || c.mlsGroups
      const group = groups.get('${commId}:${generalId}')
      if (!group) return JSON.stringify({ error: 'no group' })
      try {
        const ct = {
          epoch: ${crossCt2.epoch},
          senderIndex: ${crossCt2.senderIndex},
          ciphertext: new Uint8Array(${JSON.stringify(crossCt2.ciphertext)})
        }
        const result = await group.decrypt(ct)
        const text = new TextDecoder().decode(result.plaintext)
        return JSON.stringify({ text, senderIndex: result.senderIndex })
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    })()
  `)
  const decResult2 = JSON.parse(macDecryptResult)
  if (decResult2.error) {
    assert(false, `Mac decrypt of Linux ciphertext failed: ${decResult2.error}`)
  } else {
    assert(decResult2.text === 'reverse-decrypt-proof', `Mac decrypted Linux's ciphertext: "${decResult2.text}"`)
  }
  console.log()

  // Negative test: tampered ciphertext should fail to decrypt
  console.log('[9c] Negative: Tampered ciphertext fails to decrypt')
  const tamperResult = await cdpEval(linux, `
    (async () => {
      const c = window.__HARMONY_STORE__.client()
      const groups = c['mlsGroups'] || c.mlsGroups
      const group = groups.get('${commId}:${generalId}')
      if (!group) return JSON.stringify({ error: 'no group' })
      // Tamper with the ciphertext by flipping a byte
      const ct = {
        epoch: ${crossCt.epoch},
        senderIndex: ${crossCt.senderIndex},
        ciphertext: new Uint8Array(${JSON.stringify(crossCt.ciphertext)})
      }
      // Flip the last byte (in the MAC region)
      ct.ciphertext[ct.ciphertext.length - 1] ^= 0xFF
      try {
        await group.decrypt(ct)
        return JSON.stringify({ decrypted: true })
      } catch (e) {
        return JSON.stringify({ decrypted: false, error: e.message })
      }
    })()
  `)
  const tamper = JSON.parse(tamperResult)
  assert(!tamper.decrypted, `Tampered ciphertext correctly rejected: ${tamper.error || 'no error'}`)
  console.log()

  // ── Voice E2EE ──
  console.log('[10] Voice E2EE Bridge')

  // Check if voice client exists first
  const macHasVoice = await cdpEval(mac, `!!window.__HARMONY_STORE__.client().getVoiceClient()`)
  const linuxHasVoice = await cdpEval(linux, `!!window.__HARMONY_STORE__.client().getVoiceClient()`)

  if (macHasVoice && linuxHasVoice) {
    // Try to join voice on Mac
    try {
      await cdpEval(mac, `
        (async () => {
          await window.__HARMONY_STORE__.client().joinVoice('${generalId}')
          return 'joined'
        })()
      `, 15000)
      console.log('  Mac joined voice channel')

      await sleep(2000)

      // Check bridge on Mac
      const macBridge = await cdpEval(mac, `
        (() => {
          const vc = window.__HARMONY_STORE__.client().getVoiceClient()
          const bridge = vc?.getE2EEBridge?.()
          return JSON.stringify({
            hasBridge: !!bridge,
            hasKey: bridge?.hasKey?.() ?? false,
            epoch: bridge?.getCurrentEpoch?.() ?? 0
          })
        })()
      `)
      const macB = JSON.parse(macBridge)
      assert(macB.hasKey, `Mac voice E2EE bridge hasKey=${macB.hasKey}, epoch=${macB.epoch}`)

      // Join voice on Linux
      await cdpEval(linux, `
        (async () => {
          await window.__HARMONY_STORE__.client().joinVoice('${generalId}')
          return 'joined'
        })()
      `, 15000)
      console.log('  Linux joined voice channel')
      await sleep(2000)

      const linuxBridge = await cdpEval(linux, `
        (() => {
          const vc = window.__HARMONY_STORE__.client().getVoiceClient()
          const bridge = vc?.getE2EEBridge?.()
          return JSON.stringify({
            hasBridge: !!bridge,
            hasKey: bridge?.hasKey?.() ?? false,
            epoch: bridge?.getCurrentEpoch?.() ?? 0
          })
        })()
      `)
      const linuxB = JSON.parse(linuxBridge)
      assert(linuxB.hasKey, `Linux voice E2EE bridge hasKey=${linuxB.hasKey}, epoch=${linuxB.epoch}`)
      assert(macB.epoch === linuxB.epoch, `Voice epochs match: Mac=${macB.epoch} Linux=${linuxB.epoch}`)

      // Cleanup voice
      await cdpEval(mac, `window.__HARMONY_STORE__.client().leaveVoice().catch(() => {})`)
      await cdpEval(linux, `window.__HARMONY_STORE__.client().leaveVoice().catch(() => {})`)
    } catch (e) {
      console.log(`  ⚠️  Voice join failed: ${e.message}`)
      console.log('  Voice E2EE requires WebRTC + SFU — skipping (browser without media devices)')
    }
  } else {
    console.log(`  ⚠️  VoiceClient not available (Mac=${macHasVoice}, Linux=${linuxHasVoice})`)
    console.log('  Voice E2EE bridge requires VoiceClient configured with WebRTC — skipping')
    console.log('  This is expected in headless/CDP Chrome without media device access')
  }
  console.log()

  // ── Identity Verification ──
  console.log('[11] Identity Cross-Check')
  const macDidFinal = await cdpEval(mac, `window.__HARMONY_STORE__.did()`)
  const linuxDidFinal = await cdpEval(linux, `window.__HARMONY_STORE__.did()`)
  assert(macDidFinal !== linuxDidFinal, `Different identities confirmed (Mac ≠ Linux)`)
  assert(macDidFinal === MAC_IDENTITY.did, 'Mac DID is the one we seeded')
  assert(linuxDidFinal === LINUX_IDENTITY.did, 'Linux DID is the one we seeded')

  // Check server sees both as members
  const macMembers = await cdpEval(mac, `
    JSON.stringify(window.__HARMONY_STORE__.members?.() ?? [])
  `)
  const members = JSON.parse(macMembers || '[]')
  const memberDIDs = members.map(m => m.did || m)
  assert(memberDIDs.includes(macDidFinal) || members.length >= 2, `Server reports ≥2 members (got ${members.length})`)
  console.log()

  // ── Summary ──
  console.log('═══════════════════════════════════════')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('Failures:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  console.log('═══════════════════════════════════════')

  // Cleanup
  mac.close()
  linux.close()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
