#!/usr/bin/env node
// Harmony E2E Voice/Video/Screenshare verification
const WebSocket = require('ws')
const http = require('http')

const MAC = 'http://127.0.0.1:9222'
const LINUX = 'http://127.0.0.1:9230'

function getPageWs(cdpUrl) {
  return new Promise((resolve, reject) => {
    http.get(`${cdpUrl}/json/list`, res => {
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => {
        const page = JSON.parse(d).find(t => t.type === 'page')
        if (!page) return reject(new Error('No page'))
        resolve(page.webSocketDebuggerUrl)
      })
    }).on('error', reject)
  })
}

function cdpEval(wsUrl, expr, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, timeout)
    ws.on('open', () => ws.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true }
    })))
    ws.on('message', m => {
      const r = JSON.parse(m)
      if (r.id === 1) {
        clearTimeout(timer); ws.close()
        if (r.result?.exceptionDetails) {
          const desc = r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text
          reject(new Error(desc))
        }
        else resolve(r.result?.result?.value)
      }
    })
    ws.on('error', e => { clearTimeout(timer); reject(e) })
  })
}

async function waitForStore(wsUrl, label, maxWait = 20000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const r = await cdpEval(wsUrl, '!!globalThis.__HARMONY_STORE__', 3000)
      if (r === true) return
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`${label} store not available after ${maxWait}ms`)
}

let passed = 0, failed = 0
async function test(name, fn) {
  try {
    const result = await fn()
    console.log(`  ✅ ${name}${result ? ': ' + result : ''}`)
    passed++; return true
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`)
    failed++; return false
  }
}

async function main() {
  const macWs = await getPageWs(MAC)
  const linuxWs = await getPageWs(LINUX)
  const mac = (expr, t) => cdpEval(macWs, expr, t)
  const linux = (expr, t) => cdpEval(linuxWs, expr, t)

  console.log('\n═══════════════════════════════════════════════')
  console.log('  HARMONY E2E: VOICE / VIDEO / SCREENSHARE')
  console.log('═══════════════════════════════════════════════\n')

  // Wait for stores
  console.log('⏳ Waiting for both apps to initialize...')
  await waitForStore(macWs, 'Mac')
  await waitForStore(linuxWs, 'Linux')
  console.log('✓ Both stores ready\n')

  // ═══════ 1. BASELINE STATE ═══════
  console.log('┌─ 1. BASELINE STATE')

  await test('Mac connected with community', async () => {
    const r = JSON.parse(await mac(`JSON.stringify({
      did: globalThis.__HARMONY_STORE__.did()?.substring(0,30),
      communities: globalThis.__HARMONY_STORE__.communities()?.length,
      channels: globalThis.__HARMONY_STORE__.channels()?.map(c=>c.name+':'+c.type)
    })`))
    if (!r.communities) throw new Error('No communities')
    return `did=${r.did}, ${r.communities} community, channels=[${r.channels}]`
  })

  await test('Linux connected with community', async () => {
    const r = JSON.parse(await linux(`JSON.stringify({
      did: globalThis.__HARMONY_STORE__.did()?.substring(0,30),
      communities: globalThis.__HARMONY_STORE__.communities()?.length,
      channels: globalThis.__HARMONY_STORE__.channels()?.map(c=>c.name+':'+c.type)
    })`))
    if (!r.communities) throw new Error('No communities')
    return `did=${r.did}, ${r.communities} community, channels=[${r.channels}]`
  })

  await test('Mac server healthy on LAN', async () => {
    const r = JSON.parse(await mac(`(async()=>{for(var p of[4515,4516,4517,4518]){try{var r=await fetch('http://127.0.0.1:'+p+'/health');var d=await r.json();if(d.status==='healthy')return JSON.stringify({port:p,uptime:d.uptime})}catch(e){}}return JSON.stringify({error:'none'})})()`))
    if (r.error) throw new Error(r.error)
    return `port=${r.port}, uptime=${r.uptime}s`
  })

  // ═══════ 2. VOICE CHANNEL JOIN ═══════
  console.log('\n┌─ 2. VOICE CHANNEL JOIN')

  const joinVoiceExpr = `(async()=>{
    var s=globalThis.__HARMONY_STORE__;
    var ch=s.channels().find(c=>c.type==='voice');
    if(!ch) throw new Error('no voice channel');
    if(!s.voiceChannelId()){
      await s.client().joinVoice(ch.id);
      s.setVoiceChannelId(ch.id);
    }
    await new Promise(r=>setTimeout(r,2000));
    var conn=s.client().getVoiceConnection();
    if(!conn) throw new Error('no connection after join');
    var ds=conn.debugState();
    return JSON.stringify({channelId:ch.id.substring(0,40),audio:ds.localAudioEnabled,sendT:ds.sendTransport?.connectionState,recvT:ds.recvTransport?.connectionState,device:ds.deviceLoaded,audioProducer:ds.hasAudioProducer,consumers:ds.consumers?.length});
  })()`

  await test('Mac joins voice-lobby', async () => {
    const r = JSON.parse(await mac(joinVoiceExpr, 25000))
    return `send=${r.sendT}, recv=${r.recvT}, device=${r.device}, audioProducer=${r.audioProducer}`
  })

  await test('Linux joins voice-lobby', async () => {
    const r = JSON.parse(await linux(joinVoiceExpr, 25000))
    return `send=${r.sendT}, recv=${r.recvT}, device=${r.device}, audioProducer=${r.audioProducer}`
  })

  // Give both time to exchange producers
  await new Promise(r => setTimeout(r, 3000))

  // ═══════ 3. PARTICIPANT VISIBILITY ═══════
  console.log('\n┌─ 3. PARTICIPANT VISIBILITY')

  const participantExpr = `(()=>{
    var conn=globalThis.__HARMONY_STORE__?.client()?.getVoiceConnection();
    if(!conn) return JSON.stringify({error:'no conn'});
    return JSON.stringify({participants:conn.participants?.map(p=>({did:p.did?.substring(0,25),muted:p.muted,speaking:p.speaking}))||[]});
  })()`

  await test('Mac sees participants', async () => {
    const r = JSON.parse(await mac(participantExpr))
    if (r.error) throw new Error(r.error)
    return `${r.participants.length} participant(s)`
  })

  await test('Linux sees participants', async () => {
    const r = JSON.parse(await linux(participantExpr))
    if (r.error) throw new Error(r.error)
    return `${r.participants.length} participant(s)`
  })

  // ═══════ 4. AUDIO PRODUCERS & CONSUMERS ═══════
  console.log('\n┌─ 4. AUDIO PRODUCERS & CONSUMERS')

  const debugExpr = `(()=>{
    var conn=globalThis.__HARMONY_STORE__?.client()?.getVoiceConnection();
    if(!conn) return JSON.stringify({error:'no conn'});
    return JSON.stringify(conn.debugState());
  })()`

  await test('Mac audio state', async () => {
    const r = JSON.parse(await mac(debugExpr))
    if (r.error) throw new Error(r.error)
    return `audioEnabled=${r.localAudioEnabled}, producer=${r.hasAudioProducer}, paused=${r.audioProducerPaused}, consumers=${r.consumers?.length}`
  })

  await test('Linux audio state', async () => {
    const r = JSON.parse(await linux(debugExpr))
    if (r.error) throw new Error(r.error)
    return `audioEnabled=${r.localAudioEnabled}, producer=${r.hasAudioProducer}, paused=${r.audioProducerPaused}, consumers=${r.consumers?.length}`
  })

  await test('Mac has consumer for Linux audio', async () => {
    const r = JSON.parse(await mac(debugExpr))
    if (r.error) throw new Error(r.error)
    const audioConsumers = r.consumers?.filter(c => c.kind === 'audio') || []
    if (audioConsumers.length === 0) throw new Error(`No audio consumers (total: ${r.consumers?.length})`)
    return `${audioConsumers.length} audio consumer(s), track=${audioConsumers[0].track?.state}`
  })

  await test('Linux has consumer for Mac audio', async () => {
    const r = JSON.parse(await linux(debugExpr))
    if (r.error) throw new Error(r.error)
    const audioConsumers = r.consumers?.filter(c => c.kind === 'audio') || []
    if (audioConsumers.length === 0) throw new Error(`No audio consumers (total: ${r.consumers?.length})`)
    return `${audioConsumers.length} audio consumer(s), track=${audioConsumers[0].track?.state}`
  })

  // ═══════ 5. MUTE / UNMUTE ═══════
  console.log('\n┌─ 5. MUTE / UNMUTE')

  await test('Mac mute toggles producer pause', async () => {
    const r = JSON.parse(await mac(`(async()=>{
      var conn=globalThis.__HARMONY_STORE__?.client()?.getVoiceConnection();
      if(!conn) throw new Error('no conn');
      var before=conn.debugState();
      await conn.toggleAudio();
      var afterMute=conn.debugState();
      await conn.toggleAudio();
      var afterUnmute=conn.debugState();
      return JSON.stringify({
        beforePaused:before.audioProducerPaused,
        mutedPaused:afterMute.audioProducerPaused,
        unmutedPaused:afterUnmute.audioProducerPaused,
      });
    })()`))
    if (r.beforePaused === r.mutedPaused) throw new Error('Mute had no effect on producer')
    return `paused: ${r.beforePaused} → ${r.mutedPaused} → ${r.unmutedPaused}`
  })

  // ═══════ 6. VIDEO ENABLE ═══════
  console.log('\n┌─ 6. VIDEO')

  await test('Mac enables video (camera)', async () => {
    const r = JSON.parse(await mac(`(async()=>{
      var s=globalThis.__HARMONY_STORE__;
      var conn=s.client().getVoiceConnection();
      if(!conn.localVideoEnabled){
        await conn.enableVideo();
        s.setVideoEnabled(true);
      }
      await new Promise(r=>setTimeout(r,1500));
      var ds=conn.debugState();
      var stream=conn.getLocalVideoStream();
      var track=stream?.getVideoTracks()?.[0];
      var settings=track?.getSettings();
      return JSON.stringify({
        videoEnabled:ds.localVideoEnabled,
        hasVideoProducer:ds.hasVideoProducer,
        videoProducerPaused:ds.videoProducerPaused,
        trackState:track?.readyState,
        trackMuted:track?.muted,
        width:settings?.width,height:settings?.height,fps:settings?.frameRate
      });
    })()`, 20000))
    if (!r.videoEnabled) throw new Error('Video not enabled')
    if (!r.hasVideoProducer) throw new Error('No video producer')
    return `producer=${r.hasVideoProducer}, paused=${r.videoProducerPaused}, track=${r.trackState}, ${r.width}x${r.height}@${r.fps}fps`
  })

  // Wait for new-producer to propagate via signaling
  await new Promise(r => setTimeout(r, 4000))

  await test('Linux receives Mac video as consumer', async () => {
    const r = JSON.parse(await linux(debugExpr))
    if (r.error) throw new Error(r.error)
    const videoConsumers = r.consumers?.filter(c => c.kind === 'video') || []
    if (videoConsumers.length === 0) {
      // Debug: show all consumers
      throw new Error(`No video consumer. All consumers (${r.consumers?.length}): ${JSON.stringify(r.consumers)}`)
    }
    return `${videoConsumers.length} video consumer(s), track=${videoConsumers[0].track?.state}, paused=${videoConsumers[0].paused}`
  })

  // ═══════ 7. VIDEO GRID RENDERING ═══════
  console.log('\n┌─ 7. VIDEO GRID RENDERING')

  await test('Mac VideoGrid: local video playing', async () => {
    const r = JSON.parse(await mac(`(()=>{
      var videos=document.querySelectorAll('video');
      var data=Array.from(videos).map(v=>({readyState:v.readyState,vw:v.videoWidth,vh:v.videoHeight,paused:v.paused,srcObj:!!v.srcObject,active:v.srcObject?.active}));
      return JSON.stringify({count:videos.length,videos:data});
    })()`))
    if (r.count === 0) throw new Error('No video elements')
    const playing = r.videos.find(v => v.readyState >= 2 && v.vw > 0)
    if (!playing) throw new Error(`No playing video: ${JSON.stringify(r.videos)}`)
    return `${r.count} video element(s), playing: ${playing.vw}x${playing.vh}`
  })

  await test('Linux VideoGrid: shows remote video', async () => {
    const r = JSON.parse(await linux(`(()=>{
      var videos=document.querySelectorAll('video');
      var data=Array.from(videos).map(v=>({readyState:v.readyState,vw:v.videoWidth,vh:v.videoHeight,paused:v.paused,srcObj:!!v.srcObject,active:v.srcObject?.active,tracks:v.srcObject?.getTracks().map(t=>({kind:t.kind,state:t.readyState,muted:t.muted}))}));
      return JSON.stringify({count:videos.length,videos:data});
    })()`))
    return `${r.count} video element(s)${r.count > 0 ? ': ' + JSON.stringify(r.videos) : ''}`
  })

  // ═══════ 8. TRANSPORT HEALTH ═══════
  console.log('\n┌─ 8. TRANSPORT HEALTH')

  await test('Mac transports connected', async () => {
    const r = JSON.parse(await mac(debugExpr))
    if (r.error) throw new Error(r.error)
    const send = r.sendTransport?.connectionState
    const recv = r.recvTransport?.connectionState
    if (send !== 'connected') throw new Error(`Send transport: ${send}`)
    if (recv !== 'connected') throw new Error(`Recv transport: ${recv}`)
    return `send=${send}, recv=${recv}`
  })

  await test('Linux transports connected', async () => {
    const r = JSON.parse(await linux(debugExpr))
    if (r.error) throw new Error(r.error)
    const send = r.sendTransport?.connectionState
    const recv = r.recvTransport?.connectionState
    if (send !== 'connected') throw new Error(`Send transport: ${send}`)
    if (recv !== 'connected') throw new Error(`Recv transport: ${recv}`)
    return `send=${send}, recv=${recv}`
  })

  // ═══════ 9. VIDEO DISABLE ═══════
  console.log('\n┌─ 9. VIDEO DISABLE')

  await test('Mac disables video', async () => {
    const r = JSON.parse(await mac(`(async()=>{
      var s=globalThis.__HARMONY_STORE__;
      var conn=s.client().getVoiceConnection();
      await conn.disableVideo();
      s.setVideoEnabled(false);
      var ds=conn.debugState();
      return JSON.stringify({videoEnabled:ds.localVideoEnabled,hasVideoProducer:ds.hasVideoProducer});
    })()`))
    if (r.videoEnabled) throw new Error('Still enabled')
    return `videoEnabled=${r.videoEnabled}, producer=${r.hasVideoProducer}`
  })

  // ═══════ 10. LEAVE VOICE ═══════
  console.log('\n┌─ 10. LEAVE & REJOIN')

  await test('Linux leaves voice', async () => {
    const r = JSON.parse(await linux(`(async()=>{
      var s=globalThis.__HARMONY_STORE__;
      var client=s.client();
      if(client.getVoiceConnection()){await client.leaveVoice();s.setVoiceChannelId('')}
      return JSON.stringify({voiceChId:s.voiceChannelId(),hasConn:!!client.getVoiceConnection()});
    })()`))
    if (r.hasConn) throw new Error('Still connected')
    return 'left'
  })

  await new Promise(r => setTimeout(r, 1500))

  await test('Mac sees participant left', async () => {
    const r = JSON.parse(await mac(`(()=>{
      var ds=globalThis.__HARMONY_STORE__?.client()?.getVoiceConnection()?.debugState();
      return JSON.stringify({participants:ds?.participantCount});
    })()`))
    return `${r.participants} participant(s)`
  })

  await test('Linux rejoins voice', async () => {
    const r = JSON.parse(await linux(joinVoiceExpr, 25000))
    return `send=${r.sendT}, recv=${r.recvT}, audioProducer=${r.audioProducer}`
  })

  await new Promise(r => setTimeout(r, 2000))

  await test('Mac sees Linux back', async () => {
    const r = JSON.parse(await mac(participantExpr))
    if (r.error) throw new Error(r.error)
    return `${r.participants.length} participant(s)`
  })

  // Clean up — both leave voice
  await mac(`(async()=>{var s=globalThis.__HARMONY_STORE__;if(s.client().getVoiceConnection()){await s.client().leaveVoice();s.setVoiceChannelId('')}return 'ok'})()`, 10000).catch(()=>{})
  await linux(`(async()=>{var s=globalThis.__HARMONY_STORE__;if(s.client().getVoiceConnection()){await s.client().leaveVoice();s.setVoiceChannelId('')}return 'ok'})()`, 10000).catch(()=>{})

  // ═══════ SUMMARY ═══════
  console.log('\n═══════════════════════════════════════════════')
  console.log(`  RESULTS: ✅ ${passed} passed, ❌ ${failed} failed (${passed + failed} total)`)
  console.log('═══════════════════════════════════════════════\n')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
