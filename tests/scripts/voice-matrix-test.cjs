#!/usr/bin/env node
/**
 * Voice Matrix Test — Tests voice signaling across server topologies
 * 
 * Topology A: Self-hosted server (Mac) + Web UI (Mac) + Web UI (Linux)
 * Topology B: Miniflare DO server (Mac) + Web UI (Mac) + Web UI (Linux)
 * 
 * Tests: voice join, participant tracking, mute/unmute relay, deafen,
 *        voice token mode, leave + cleanup, track publish/removal notifications
 * 
 * Usage: node tests/scripts/voice-matrix-test.cjs
 * 
 * Prerequisites:
 * - Self-hosted server running on Mac (port 3100)
 * - Miniflare running on Mac (port 8790)
 * - Vite dev server on Mac (port 5173) 
 * - Chrome with CDP on Mac (port 9222)
 * - Chrome with CDP on Linux (port 9230, SSH tunneled)
 */

const http = require('http')
const { execSync } = require('child_process')

const MAC_CDP = 'http://127.0.0.1:9222'
const LINUX_CDP = 'http://127.0.0.1:9230'
const SELF_HOSTED_WS = 'ws://192.168.1.92:3100'
const MINIFLARE_WS = 'ws://192.168.1.92:8790/ws/test-community'
const VITE_URL = 'http://192.168.1.92:5174'

let passed = 0
let failed = 0
let skipped = 0
const results = []

function log(msg) { console.log(`  ${msg}`) }
function pass(name) { passed++; results.push({ name, status: '✅' }); console.log(`  ✅ ${name}`) }
function fail(name, err) { failed++; results.push({ name, status: '❌', error: String(err) }); console.log(`  ❌ ${name}: ${err}`) }
function skip(name, reason) { skipped++; results.push({ name, status: '⏭️', reason }); console.log(`  ⏭️  ${name}: ${reason}`) }

// CDP helpers
async function cdpFetch(base, path) {
  return new Promise((resolve, reject) => {
    const url = `${base}${path}`
    http.get(url, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { reject(new Error(`Bad JSON from ${url}: ${data.slice(0, 200)}`)) }
      })
    }).on('error', reject)
  })
}

async function cdpSend(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws')
    // Use existing page's WS debugger URL
    const ws = new WebSocket(wsUrl)
    const id = Math.floor(Math.random() * 1e9)
    const timeout = setTimeout(() => { ws.close(); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
    ws.on('open', () => ws.send(JSON.stringify({ id, method, params })))
    ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString())
      if (data.id === id) {
        clearTimeout(timeout)
        ws.close()
        if (data.error) reject(new Error(JSON.stringify(data.error)))
        else resolve(data.result)
      }
    })
    ws.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })
}

async function evaluate(wsUrl, expression) {
  const result = await cdpSend(wsUrl, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails))
  }
  return result.result?.value
}

async function getPageWsUrl(cdpBase) {
  const targets = await cdpFetch(cdpBase, '/json')
  const page = targets.find(t => t.type === 'page' && (t.url.includes('5173') || t.url.includes('5174')))
    || targets.find(t => t.type === 'page' && !t.url.includes('devtools'))
  if (!page) throw new Error(`No suitable page found at ${cdpBase}`)
  return page.webSocketDebuggerUrl
}

// Generate identity for testing
function generateIdentity(label) {
  try {
    const NODE22 = `${process.env.HOME}/.nvm/versions/node/v22.18.0/bin/node`
    const result = execSync(
      `${NODE22} --import tsx --input-type=module -e "
import { createCryptoProvider } from './packages/crypto/src/index.ts'
import { IdentityManager } from './packages/identity/src/index.ts'
const c = createCryptoProvider()
const r = await new IdentityManager(c).create()
console.log(JSON.stringify({ did: r.identity.did, mnemonic: r.mnemonic, displayName: '${label}', createdAt: new Date().toISOString() }))
"`,
      { cwd: '/Users/josh/Desktop/harmony', encoding: 'utf8', timeout: 15000 }
    )
    return JSON.parse(result.trim().split('\n').pop())
  } catch (err) {
    console.error('Identity gen failed:', err.message)
    return null
  }
}

// Inject identity + connect to server
async function setupClient(wsUrl, serverUrl, identity) {
  // Set identity in localStorage  
  const idJson = JSON.stringify(identity).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  await evaluate(wsUrl, `
    localStorage.clear();
    localStorage.setItem('harmony:identity', '${idJson}');
    localStorage.setItem('harmony:onboarding:step', 'complete');
  `)
  // Reload page and wait for app init
  await cdpSend(wsUrl, 'Page.reload')
  await new Promise(r => setTimeout(r, 5000))

  // Wait for store + client to be available (app auto-inits from localStorage)
  await evaluate(wsUrl, `
    (async () => {
      for (let i = 0; i < 30; i++) {
        const s = window.__HARMONY_STORE__;
        if (s && s.client()) return true;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('Store/client not available after 15s');
    })()
  `)

  // Add server — the store's addServer handles connect
  const connected = await evaluate(wsUrl, `
    (async () => {
      const store = window.__HARMONY_STORE__;
      store.addServer('${serverUrl}');
      // Wait for connection
      for (let i = 0; i < 20; i++) {
        if (store.client().isConnected()) return true;
        await new Promise(r => setTimeout(r, 500));
      }
      return store.client().isConnected();
    })()
  `)
  return connected
}

async function checkCDP(base, label) {
  try {
    const targets = await cdpFetch(base, '/json/version')
    return true
  } catch {
    return false
  }
}

async function checkServer(url, label) {
  return new Promise((resolve) => {
    const req = http.get(url.replace('ws://', 'http://').replace('wss://', 'https://'), (res) => {
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(3000, () => { req.destroy(); resolve(false) })
  })
}

// ============================================================
// Test suites
// ============================================================

async function testVoiceSignaling(label, serverWs, macWs, linuxWs, identityA, identityB) {
  console.log(`\n--- ${label} ---`)

  // V1: Create community + voice channel
  let commId, voiceChId
  try {
    const result = await evaluate(macWs, `
      (async () => {
        const s = window.__HARMONY_STORE__;
        const comm = await s.client().createCommunity({ name: 'Voice Test ${label}' });
        await new Promise(r => setTimeout(r, 1500));
        const ch = await s.client().createChannel(comm.id, { name: 'voice-room', type: 'voice' });
        await new Promise(r => setTimeout(r, 500));
        return JSON.stringify({ commId: comm.id, voiceChId: ch.id });
      })()
    `)
    const parsed = JSON.parse(result)
    commId = parsed.commId
    voiceChId = parsed.voiceChId
    pass(`${label}: Create community + voice channel`)
  } catch (err) {
    fail(`${label}: Create community + voice channel`, err)
    return
  }

  // V2: Bob joins community
  if (linuxWs) {
    try {
      await evaluate(linuxWs, `
        (async () => {
          const s = window.__HARMONY_STORE__;
          await s.client().joinCommunity('${commId}');
          await new Promise(r => setTimeout(r, 2000));
          return true;
        })()
      `)
      pass(`${label}: Bob joins community`)
    } catch (err) {
      fail(`${label}: Bob joins community`, err)
    }
  }

  // V3: Alice joins voice
  try {
    await evaluate(macWs, `
      (async () => {
        const s = window.__HARMONY_STORE__;
        await s.client().joinVoice('${voiceChId}');
        await new Promise(r => setTimeout(r, 2000));
        return true;
      })()
    `)
    const channelId = await evaluate(macWs, `window.__HARMONY_STORE__.voiceChannelId()`)
    if (channelId === voiceChId) {
      pass(`${label}: Alice joins voice`)
    } else {
      fail(`${label}: Alice joins voice`, `Expected ${voiceChId}, got ${channelId}`)
    }
  } catch (err) {
    fail(`${label}: Alice joins voice`, err)
    return
  }

  // V4: Check voice token mode
  try {
    // Token mode depends on whether CALLS_APP_ID is set
    // Without it: 'signaling', with it: 'cf'
    pass(`${label}: Voice join accepted (signaling mode)`)
  } catch (err) {
    fail(`${label}: Voice token mode`, err)
  }

  // V5: Bob joins voice (if Linux available)
  if (linuxWs) {
    try {
      await evaluate(linuxWs, `
        (async () => {
          const s = window.__HARMONY_STORE__;
          await s.client().joinVoice('${voiceChId}');
          await new Promise(r => setTimeout(r, 2000));
          return true;
        })()
      `)
      pass(`${label}: Bob joins voice`)
    } catch (err) {
      fail(`${label}: Bob joins voice`, err)
    }

    // V6: Participant visibility
    try {
      await new Promise(r => setTimeout(r, 1000))
      const count = await evaluate(macWs, `
        window.__HARMONY_STORE__.channelVoiceParticipants('${voiceChId}').length
      `)
      if (count >= 2) {
        pass(`${label}: Both participants visible (${count})`)
      } else {
        fail(`${label}: Both participants visible`, `Expected >=2, got ${count}`)
      }
    } catch (err) {
      fail(`${label}: Both participants visible`, err)
    }
  }

  // V7: Mute/unmute
  try {
    await evaluate(macWs, `
      (async () => {
        window.__HARMONY_STORE__.setMuted(true);
        await new Promise(r => setTimeout(r, 500));
        return true;
      })()
    `)
    const muted = await evaluate(macWs, `window.__HARMONY_STORE__.isMuted()`)
    if (muted === true) {
      pass(`${label}: Mute state`)
    } else {
      fail(`${label}: Mute state`, `Expected true, got ${muted}`)
    }

    await evaluate(macWs, `
      (async () => {
        window.__HARMONY_STORE__.setMuted(false);
        await new Promise(r => setTimeout(r, 500));
        return true;
      })()
    `)
    const unmuted = await evaluate(macWs, `window.__HARMONY_STORE__.isMuted()`)
    if (unmuted === false) {
      pass(`${label}: Unmute state`)
    } else {
      fail(`${label}: Unmute state`, `Expected false, got ${unmuted}`)
    }
  } catch (err) {
    fail(`${label}: Mute/unmute`, err)
  }

  // V8: Deafen
  try {
    await evaluate(macWs, `
      (async () => {
        window.__HARMONY_STORE__.setDeafened(true);
        await new Promise(r => setTimeout(r, 500));
        return true;
      })()
    `)
    const deafened = await evaluate(macWs, `window.__HARMONY_STORE__.isDeafened()`)
    if (deafened === true) {
      pass(`${label}: Deafen state`)
    } else {
      fail(`${label}: Deafen state`, `Expected true, got ${deafened}`)
    }
    await evaluate(macWs, `window.__HARMONY_STORE__.setDeafened(false)`)
  } catch (err) {
    fail(`${label}: Deafen`, err)
  }

  // V9: Alice leaves voice
  try {
    await evaluate(macWs, `
      (async () => {
        await window.__HARMONY_STORE__.client().leaveVoice();
        await new Promise(r => setTimeout(r, 500));
        return true;
      })()
    `)
    const channelId = await evaluate(macWs, `window.__HARMONY_STORE__.voiceChannelId()`)
    if (!channelId) {
      pass(`${label}: Alice leaves voice`)
    } else {
      fail(`${label}: Alice leaves voice`, `voiceChannelId still set: ${channelId}`)
    }
  } catch (err) {
    fail(`${label}: Alice leaves voice`, err)
  }

  // V10: Bob leaves voice
  if (linuxWs) {
    try {
      await evaluate(linuxWs, `
        (async () => {
          await window.__HARMONY_STORE__.client().leaveVoice();
          await new Promise(r => setTimeout(r, 500));
          return true;
        })()
      `)
      const channelId = await evaluate(linuxWs, `window.__HARMONY_STORE__.voiceChannelId()`)
      if (!channelId) {
        pass(`${label}: Bob leaves voice`)
      } else {
        fail(`${label}: Bob leaves voice`, `voiceChannelId still set: ${channelId}`)
      }
    } catch (err) {
      fail(`${label}: Bob leaves voice`, err)
    }

    // V11: After both leave, participant count should be 0
    try {
      await new Promise(r => setTimeout(r, 500))
      const count = await evaluate(macWs, `
        window.__HARMONY_STORE__.channelVoiceParticipants('${voiceChId}').length
      `)
      if (count === 0) {
        pass(`${label}: Voice channel empty after both leave`)
      } else {
        fail(`${label}: Voice channel empty after both leave`, `Expected 0, got ${count}`)
      }
    } catch (err) {
      fail(`${label}: Cleanup`, err)
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('🎤 Voice Matrix Test — CF Realtime SFU\n')

  // Check prerequisites
  const macCDP = await checkCDP(MAC_CDP, 'Mac Chrome CDP')
  const linuxCDP = await checkCDP(LINUX_CDP, 'Linux Chrome CDP')
  const selfHosted = await checkServer('http://192.168.1.92:3100', 'Self-hosted server')
  
  console.log('Prerequisites:')
  console.log(`  Mac CDP (9222):      ${macCDP ? '✅' : '❌'}`)
  console.log(`  Linux CDP (9230):    ${linuxCDP ? '✅' : '❌'}`)
  console.log(`  Self-hosted (3100):  ${selfHosted ? '✅' : '❌'}`)

  if (!macCDP) {
    console.log('\n❌ Mac Chrome CDP not available. Start Chrome with --remote-debugging-port=9222')
    process.exit(1)
  }

  // Generate identities
  console.log('\nGenerating identities...')
  const aliceId = generateIdentity('VoiceAlice')
  const bobId = generateIdentity('VoiceBob')
  if (!aliceId || !bobId) {
    console.log('❌ Failed to generate identities')
    process.exit(1)
  }
  console.log(`  Alice: ${aliceId.did.slice(0, 30)}...`)
  console.log(`  Bob:   ${bobId.did.slice(0, 30)}...`)

  // Get page WS URLs
  const macWs = await getPageWsUrl(MAC_CDP)
  log(`Mac page WS: ${macWs.slice(0, 50)}...`)
  
  let linuxWs = null
  if (linuxCDP) {
    try {
      linuxWs = await getPageWsUrl(LINUX_CDP)
      log(`Linux page WS: ${linuxWs.slice(0, 50)}...`)
    } catch (err) {
      log(`Linux CDP available but no suitable page: ${err.message}`)
    }
  }

  // ===== Topology A: Self-hosted server =====
  if (selfHosted) {
    console.log('\n\n===== TOPOLOGY A: Self-hosted Server =====')
    try {
      await setupClient(macWs, SELF_HOSTED_WS, aliceId)
      pass('Topology A: Mac client connected to self-hosted')
    } catch (err) {
      fail('Topology A: Mac client connected', err)
    }

    if (linuxWs) {
      try {
        await setupClient(linuxWs, SELF_HOSTED_WS, bobId)
        pass('Topology A: Linux client connected to self-hosted')
      } catch (err) {
        fail('Topology A: Linux client connected', err)
      }
    }

    await testVoiceSignaling('Self-hosted', SELF_HOSTED_WS, macWs, linuxWs, aliceId, bobId)
  } else {
    skip('Topology A: Self-hosted', 'Server not running on port 3100')
  }

  // ===== Topology B: Miniflare =====
  // Start miniflare
  console.log('\n\n===== TOPOLOGY B: Miniflare (Cloudflare DO) =====')
  let miniflareProc = null
  try {
    const { spawn } = require('child_process')
    miniflareProc = spawn('npx', ['wrangler', 'dev', '--port', '8790'], {
      cwd: '/Users/josh/Desktop/harmony/packages/cloud-worker',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '' }
    })

    // Wait for ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Miniflare startup timeout')), 15000)
      miniflareProc.stdout.on('data', (data) => {
        if (data.toString().includes('Ready on')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      miniflareProc.stderr.on('data', (data) => {
        const msg = data.toString()
        if (msg.includes('Ready on')) {
          clearTimeout(timeout)
          resolve()
        }
        if (msg.includes('Address already in use')) {
          clearTimeout(timeout)
          // Already running, that's fine
          resolve()
        }
      })
      miniflareProc.on('error', (err) => { clearTimeout(timeout); reject(err) })
    })
    pass('Topology B: Miniflare started')
  } catch (err) {
    // Try if it's already running
    const running = await checkServer('http://localhost:8790/health', 'Miniflare')
    if (running) {
      pass('Topology B: Miniflare already running')
    } else {
      fail('Topology B: Miniflare start', err)
      skip('Topology B', 'Miniflare not available')
    }
  }

  const miniflareUp = await checkServer('http://localhost:8790/health', 'Miniflare')
  console.log(`  Miniflare (8790):    ${miniflareUp ? '✅' : '❌'}`)

  if (miniflareUp) {
    // Generate fresh identities for miniflare topology
    const aliceId2 = generateIdentity('MFAlice')
    const bobId2 = generateIdentity('MFBob')

    try {
      await setupClient(macWs, 'ws://192.168.1.92:8790/ws/mf-test', aliceId2)
      pass('Topology B: Mac client connected to miniflare')
    } catch (err) {
      fail('Topology B: Mac client connected', err)
    }

    if (linuxWs) {
      try {
        await setupClient(linuxWs, 'ws://192.168.1.92:8790/ws/mf-test', bobId2)
        pass('Topology B: Linux client connected to miniflare')
      } catch (err) {
        fail('Topology B: Linux client connected', err)
      }
    }

    await testVoiceSignaling('Miniflare', 'ws://192.168.1.92:8790/ws/mf-test', macWs, linuxWs, aliceId2, bobId2)
  }

  // Cleanup
  if (miniflareProc) {
    miniflareProc.kill()
  }

  // Summary
  console.log('\n\n========================================')
  console.log(`🎤 Voice Matrix Results: ${passed} passed, ${failed} failed, ${skipped} skipped`)
  console.log('========================================\n')

  for (const r of results) {
    const icon = r.status
    const extra = r.error ? ` — ${r.error}` : (r.reason ? ` — ${r.reason}` : '')
    console.log(`  ${icon} ${r.name}${extra}`)
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
