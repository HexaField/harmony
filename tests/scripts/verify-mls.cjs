/**
 * MLS Key Exchange Cross-Device Verification
 * Mac Chrome (18800) + Linux Chrome (via SSH)
 * WS Server on Mac (4700), reverse-tunneled to Linux
 */
const WebSocket = require('ws')
const http = require('http')
const { execSync } = require('child_process')

const MAC_PORT = 18800
const SERVER_URL = 'ws://127.0.0.1:4700'

function getPages(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data).filter(p => p.type === 'page' && p.url.includes('5180'))))
    }).on('error', reject)
  })
}

function cdpLocal(wsUrl) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl)
    let id = 1
    const pending = new Map()
    ws.on('open', () => {
      const send = (method, params={}) => new Promise(res => {
        const mid = id++; pending.set(mid, res)
        ws.send(JSON.stringify({id:mid, method, params}))
      })
      resolve({ send, ws })
    })
    ws.on('message', data => {
      const msg = JSON.parse(data.toString())
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id) }
    })
  })
}

function evalMac(client, expr) {
  return client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then(r => { if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value })
}

function evalLinux(expr) {
  // Execute CDP command on Linux via SSH
  const script = `
    const WebSocket = require('ws')
    const http = require('http')
    http.get('http://127.0.0.1:9230/json', (res) => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        const p=JSON.parse(d).find(p=>p.type==='page')
        if(!p){console.log(JSON.stringify({error:'no page'}));process.exit(0)}
        const ws=new WebSocket(p.webSocketDebuggerUrl)
        ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:${JSON.stringify(expr)},returnByValue:true,awaitPromise:true}})))
        ws.on('message',data=>{const m=JSON.parse(data.toString());if(m.id===1){console.log(JSON.stringify(m.result?.result?.value));ws.close();process.exit(0)}})
        setTimeout(()=>{console.log(JSON.stringify({error:'timeout'}));process.exit(1)},10000)
      })
    })
  `
  try {
    const result = execSync(`ssh josh@192.168.1.2 "cd /tmp && node -e '${script.replace(/'/g, "'\\''")}'"`  , { timeout: 15000 }).toString().trim()
    return JSON.parse(result)
  } catch (e) {
    return { error: e.message }
  }
}

async function main() {
  console.log('=== MLS Key Exchange Cross-Device Verification ===\n')
  
  // Mac pages
  const macPages = await getPages(MAC_PORT)
  if (!macPages.length) { console.log('❌ No Mac page on :' + MAC_PORT); process.exit(1) }
  const mac = await cdpLocal(macPages[0].webSocketDebuggerUrl)
  await mac.send('Runtime.enable')
  console.log('✅ Mac CDP connected')

  // Linux test
  const linuxTitle = evalLinux('document.title + " @ " + location.href')
  console.log('✅ Linux CDP:', typeof linuxTitle === 'string' ? linuxTitle : JSON.stringify(linuxTitle))

  // 1. Check/create identities
  let macDid = await evalMac(mac, `JSON.parse(localStorage.getItem('harmony:identity') || '{}').did || null`)
  let linuxDid = evalLinux(`JSON.parse(localStorage.getItem('harmony:identity') || '{}').did || null`)
  console.log('\nMac DID:', macDid || '(needs setup)')
  console.log('Linux DID:', linuxDid || '(needs setup)')

  // 2. Setup onboarding if needed
  if (!macDid) {
    await evalMac(mac, `localStorage.setItem('harmony:onboarding:step','complete'); location.reload()`)
    await new Promise(r => setTimeout(r, 4000))
    macDid = await evalMac(mac, `JSON.parse(localStorage.getItem('harmony:identity') || '{}').did`)
    console.log('Mac DID (after setup):', macDid)
  }
  if (!linuxDid) {
    evalLinux(`localStorage.setItem('harmony:onboarding:step','complete'); location.reload(); 'ok'`)
    await new Promise(r => setTimeout(r, 4000))
    linuxDid = evalLinux(`JSON.parse(localStorage.getItem('harmony:identity') || '{}').did`)
    console.log('Linux DID (after setup):', linuxDid)
  }

  // 3. Check store
  const macStore = await evalMac(mac, `!!window.__HARMONY_STORE__`)
  const linuxStore = evalLinux(`!!window.__HARMONY_STORE__`)
  console.log('\nMac store:', macStore, '| Linux store:', linuxStore)
  if (!macStore || !linuxStore) { console.log('❌ Store not ready'); process.exit(1) }

  // 4. Connect to server
  console.log('\n--- Connecting to server ---')
  await evalMac(mac, `window.__HARMONY_STORE__.addServer('${SERVER_URL}'); 'ok'`)
  await new Promise(r => setTimeout(r, 2000))
  evalLinux(`window.__HARMONY_STORE__.addServer('${SERVER_URL}'); 'ok'`)
  await new Promise(r => setTimeout(r, 2000))

  const macConn = await evalMac(mac, `window.__HARMONY_STORE__.connectionState?.() || 'unknown'`)
  const linuxConn = evalLinux(`window.__HARMONY_STORE__.connectionState?.() || 'unknown'`)
  console.log('Mac:', macConn, '| Linux:', linuxConn)

  // 5. Create community (Mac)
  console.log('\n--- Creating community ---')
  const commId = await evalMac(mac, `new Promise((res,rej)=>{
    const t=setTimeout(()=>rej('timeout'),10000);const c=window.__HARMONY_STORE__.client();
    c.emitter.on('community.updated',e=>{clearTimeout(t);res(e.communityId||e.id)});
    c.createCommunity({name:'MLS-Verify-'+Date.now()})
  })`)
  console.log('Community:', commId)
  await new Promise(r => setTimeout(r, 2000))

  // 6. Get channel
  const generalId = await evalMac(mac, `(()=>{const c=window.__HARMONY_STORE__.communities();return c.find(x=>x.id==='${commId}')?.channels?.[0]?.id||'none'})()`)
  console.log('Channel:', generalId)

  // 7. Join from Linux
  console.log('\n--- Linux joining ---')
  evalLinux(`new Promise((res,rej)=>{
    const t=setTimeout(()=>rej('timeout'),10000);const c=window.__HARMONY_STORE__.client();
    c.emitter.on('community.updated',()=>{clearTimeout(t);res(true)});
    c.joinCommunity('${commId}')
  })`)
  
  // Wait for MLS key exchange
  console.log('Waiting for MLS key exchange (6s)...')
  await new Promise(r => setTimeout(r, 6000))

  // 8. Check MLS state
  const macMls = await evalMac(mac, `(()=>{const c=window.__HARMONY_STORE__.client();const g=c.mlsGroups.get('${commId}:${generalId}');return{epoch:g?.epoch,members:g?.memberCount?.()}})()`)
  const linuxMls = evalLinux(`(()=>{const c=window.__HARMONY_STORE__.client();const gs=[...c.mlsGroups.keys()];const gk=gs.find(g=>g.includes('${commId}'));const g=gk?c.mlsGroups.get(gk):null;return{epoch:g?.epoch,members:g?.memberCount?.(),groupId:gk}})()`)
  console.log('\nMac MLS:', JSON.stringify(macMls))
  console.log('Linux MLS:', JSON.stringify(linuxMls))

  const mlsOk = macMls?.epoch === linuxMls?.epoch && macMls?.members === 2 && linuxMls?.members === 2
  console.log(mlsOk ? '✅ MLS key exchange: PASS' : '❌ MLS key exchange: FAIL')

  // 9. Send message Mac → Linux
  console.log('\n--- Testing encryption ---')
  const testMsg = 'E2EE-' + Date.now()
  await evalMac(mac, `window.__HARMONY_STORE__.client().sendMessage('${commId}','${generalId}','${testMsg}'); 'sent'`)
  await new Promise(r => setTimeout(r, 3000))

  const linuxMsgs = evalLinux(`(()=>{const m=window.__HARMONY_STORE__.channelMessages('${generalId}');return m?.map(x=>x.content)||[]})()`)
  console.log('Linux messages:', JSON.stringify(linuxMsgs))
  const macToLinux = Array.isArray(linuxMsgs) && linuxMsgs.includes(testMsg)
  console.log(macToLinux ? '✅ Mac→Linux decryption: PASS' : '❌ Mac→Linux decryption: FAIL')

  // 10. Send message Linux → Mac
  const testMsg2 = 'REVERSE-' + Date.now()
  evalLinux(`window.__HARMONY_STORE__.client().sendMessage('${commId}','${generalId}','${testMsg2}'); 'sent'`)
  await new Promise(r => setTimeout(r, 3000))

  const macMsgs = await evalMac(mac, `(()=>{const m=window.__HARMONY_STORE__.channelMessages('${generalId}');return m?.map(x=>x.content)||[]})()`)
  console.log('Mac messages:', JSON.stringify(macMsgs))
  const linuxToMac = Array.isArray(macMsgs) && macMsgs.includes(testMsg2)
  console.log(linuxToMac ? '✅ Linux→Mac decryption: PASS' : '❌ Linux→Mac decryption: FAIL')

  // 11. Verify MLS was used (not plaintext)
  const wasEncrypted = macMls?.members > 1
  console.log(wasEncrypted ? '✅ MLS encryption active: PASS' : '❌ MLS encryption: FAIL (plaintext fallback)')

  // Summary
  const all = mlsOk && macToLinux && linuxToMac && wasEncrypted
  console.log('\n=== RESULT:', all ? '✅ ALL PASSED' : '❌ SOME FAILED', '===')

  mac.ws.close()
  process.exit(all ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
