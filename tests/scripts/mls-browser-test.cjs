#!/usr/bin/env node
const WebSocket = require('ws')
const http = require('http')

function getPages() {
  return new Promise(res => {
    http.get('http://127.0.0.1:18800/json', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () =>
        res(JSON.parse(d).filter(p => p.type === 'page' && p.url.includes('5180')))
      )
    })
  })
}

function cdp(url) {
  return new Promise(res => {
    const ws = new WebSocket(url); let id = 1; const p = new Map(); const logs = []
    ws.on('open', () => {
      const send = (m, pa = {}) => new Promise(r => { const i = id++; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pa })) })
      res({ send, ws, logs })
    })
    ws.on('message', d => {
      const m = JSON.parse(d.toString())
      if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id) }
      if (m.method === 'Runtime.consoleAPICalled') {
        const t = m.params?.args?.map(a => a.value || a.description || '').join(' ')
        if (t.includes('MLS') || t.includes('mls') || t.includes('epoch') || t.includes('decrypt')) logs.push(t)
      }
    })
  })
}

function ev(c, expr) {
  return c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then(r => {
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    })
}

async function main() {
  const pages = await getPages()
  if (pages.length < 2) { console.log('Need 2 tabs on :5180, got', pages.length); process.exit(1) }
  console.log('Found', pages.length, 'tabs')

  const alice = await cdp(pages[0].webSocketDebuggerUrl)
  const bob = await cdp(pages[1].webSocketDebuggerUrl)
  await alice.send('Runtime.enable')
  await bob.send('Runtime.enable')

  // Generate real identities
  const { execSync } = require('child_process')
  const aliceId = JSON.parse(execSync('node --import tsx gen-identity.mts', { encoding: 'utf-8', cwd: __dirname }).trim())
  aliceId.displayName = 'Alice'
  const bobId = JSON.parse(execSync('node --import tsx gen-identity.mts', { encoding: 'utf-8', cwd: __dirname }).trim())
  bobId.displayName = 'Bob'
  console.log('Alice:', aliceId.did.slice(-8), '| Bob:', bobId.did.slice(-8))

  // Set Alice identity on port 5180 origin, Bob on port 5181 (different localStorage)
  await ev(alice, `localStorage.clear(); localStorage.setItem('harmony:identity', ${JSON.stringify(JSON.stringify(aliceId))}); localStorage.setItem('harmony:onboarding:step', 'complete'); 'ok'`)
  await alice.send('Page.navigate', { url: 'http://127.0.0.1:5180/?t=' + Date.now() })

  // Navigate Bob to port 5181 first, then set identity
  await bob.send('Page.navigate', { url: 'http://127.0.0.1:5181/?t=' + Date.now() })
  await new Promise(r => setTimeout(r, 3000))

  // Reconnect CDP after navigation
  alice.ws.close(); bob.ws.close()

  function findPage(port) {
    return new Promise(res => {
      http.get('http://127.0.0.1:18800/json', r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => {
          const pages = JSON.parse(d).filter(p => p.type === 'page' && p.url.includes(':' + port))
          res(pages[0])
        })
      })
    })
  }

  let alicePage = await findPage(5180)
  let bobPage = await findPage(5181)
  if (!alicePage || !bobPage) { console.log('Missing pages'); process.exit(1) }

  let a = await cdp(alicePage.webSocketDebuggerUrl)
  let b = await cdp(bobPage.webSocketDebuggerUrl)
  await a.send('Runtime.enable')
  await b.send('Runtime.enable')

  // Set Bob's identity on his origin (5181)
  await ev(b, `localStorage.clear(); localStorage.setItem('harmony:identity', ${JSON.stringify(JSON.stringify(bobId))}); localStorage.setItem('harmony:onboarding:step', 'complete'); 'ok'`)
  await b.send('Page.navigate', { url: 'http://127.0.0.1:5181/?t=' + Date.now() })
  await new Promise(r => setTimeout(r, 3000))

  // Final reconnect
  a.ws.close(); b.ws.close()
  alicePage = await findPage(5180)
  bobPage = await findPage(5181)
  const alice2 = await cdp(alicePage.webSocketDebuggerUrl)
  const bob3 = await cdp(bobPage.webSocketDebuggerUrl)
  await alice2.send('Runtime.enable')
  await bob3.send('Runtime.enable')

  // Wait for store + client with identity
  const waitReady = `new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('client timeout')), 15000); const check = () => { const s = window.__HARMONY_STORE__; if (s && s.client() && s.did()?.length > 0) { clearTimeout(t); res(true) } else setTimeout(check, 300) }; check() })`
  await ev(alice2, waitReady)
  await ev(bob3, waitReady)
  console.log('Both clients ready')

  // Connect both
  await ev(alice2, 'window.__HARMONY_STORE__.addServer("ws://127.0.0.1:4700"); "ok"')
  await new Promise(r => setTimeout(r, 3000))
  await ev(bob3, 'window.__HARMONY_STORE__.addServer("ws://127.0.0.1:4700"); "ok"')
  await new Promise(r => setTimeout(r, 3000))

  const ac = await ev(alice2, 'window.__HARMONY_STORE__.connectionState?.() || "?"')
  const bc = await ev(bob3, 'window.__HARMONY_STORE__.connectionState?.() || "?"')
  const ae = await ev(alice2, 'window.__HARMONY_STORE__.connectionError?.() || ""')
  console.log('Conn — Alice:', ac, ae, '| Bob:', bc)
  if (ac !== 'connected') {
    // Wait more and check again
    await new Promise(r => setTimeout(r, 5000))
    const ac2 = await ev(alice2, 'window.__HARMONY_STORE__.connectionState?.() || "?"')
    const ae2 = await ev(alice2, 'window.__HARMONY_STORE__.connectionError?.() || ""')
    console.log('Conn retry — Alice:', ac2, ae2)
    if (ac2 !== 'connected') {
      console.log('Not connected — aborting')
      alice2.ws.close(); bob3.ws.close(); process.exit(1)
    }
  }

  // Alice creates community
  const commId = await ev(alice2, `
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout creating community')), 10000)
      const c = window.__HARMONY_STORE__.client()
      c.emitter.on('community.updated', e => { clearTimeout(t); res(e.communityId || e.id) })
      c.createCommunity({ name: 'MLS-' + Date.now() })
    })
  `)
  console.log('Community:', commId)
  await new Promise(r => setTimeout(r, 1000))

  const chId = await ev(alice2, `
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('no channel after 10s')), 10000)
      const check = () => {
        // Check both store and client internal state
        const c = window.__HARMONY_STORE__.client()
        const comm = c._communities?.get('${commId}')
        const ch = comm?.channels?.[0]?.id
        if (ch) { clearTimeout(t); res(ch) }
        else {
          const storeCh = window.__HARMONY_STORE__.communities()?.find(x => x.id === '${commId}')?.channels?.[0]?.id
          if (storeCh) { clearTimeout(t); res(storeCh) }
          else setTimeout(check, 500)
        }
      }
      check()
    })
  `)
  console.log('Channel:', chId)

  // Bob joins
  await ev(bob3, `
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout joining')), 10000)
      const c = window.__HARMONY_STORE__.client()
      c.emitter.on('community.updated', () => { clearTimeout(t); res(true) })
      c.joinCommunity('${commId}')
    })
  `)
  console.log('Bob joined')

  // Wait for MLS handshake
  console.log('Waiting 8s for MLS handshake...')
  await new Promise(r => setTimeout(r, 8000))

  // Check MLS state
  const amls = await ev(alice2, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const g = c.mlsGroups.get('${commId}:${chId}')
      return g ? { epoch: g.epoch, members: g.memberCount() } : null
    })()
  `)
  const bmls = await ev(bob3, `
    (() => {
      const c = window.__HARMONY_STORE__.client()
      const keys = [...c.mlsGroups.keys()]
      const key = keys.find(k => k.includes('${chId}'))
      const g = key ? c.mlsGroups.get(key) : null
      return g ? { epoch: g.epoch, members: g.memberCount(), key } : { keys }
    })()
  `)
  console.log('Alice MLS:', JSON.stringify(amls))
  console.log('Bob MLS:', JSON.stringify(bmls))

  // Send message from Alice
  const msg = 'hello-mls-' + Date.now()
  await ev(alice2, `window.__HARMONY_STORE__.client().sendMessage('${commId}', '${chId}', '${msg}'); 'sent'`)
  console.log('Alice sent:', msg)
  await new Promise(r => setTimeout(r, 3000))

  // Check Bob's received messages
  const bobMsgs = await ev(bob3, `
    (() => {
      const m = window.__HARMONY_STORE__.channelMessages('${chId}')
      return m?.map(x => ({ content: x.content, sender: x.sender?.slice(-8) })) || []
    })()
  `)
  console.log('Bob messages:', JSON.stringify(bobMsgs))

  // Print MLS logs
  console.log('\n--- Alice MLS logs ---')
  alice2.logs.forEach(l => console.log(' ', l))
  console.log('--- Bob MLS logs ---')
  bob3.logs.forEach(l => console.log(' ', l))

  const pass = Array.isArray(bobMsgs) && bobMsgs.some(m => m.content === msg)
  console.log(pass ? '\n✅ MLS PASS — Bob decrypted message' : '\n❌ MLS FAIL — Bob could not decrypt')

  alice2.ws.close(); bob3.ws.close()
  process.exit(pass ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
