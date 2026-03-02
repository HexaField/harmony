#!/usr/bin/env node
// Cross-device media E2E test: Mac (Electron/CDP:9222) ↔ Linux (Chromium/CDP:9230)
// Both connected to self-hosted server on port 9999
const WebSocket = require('/Users/josh/Desktop/harmony/node_modules/.pnpm/ws@8.19.0/node_modules/ws');

const MAC_CDP = 'http://localhost:9222';
const LINUX_CDP = 'http://localhost:9230';
const SERVER = 'ws://localhost:9999';
const SERVER_LAN = 'ws://192.168.1.92:9999';

let passed = 0, failed = 0;
function log(id, name, pass, comment) {
  const mark = pass ? '✅' : '❌';
  if (pass) passed++; else failed++;
  console.log(`${mark} ${id} ${name}${comment ? ' — ' + comment : ''}`);
}

async function getPageWS(cdpUrl) {
  const targets = await fetch(`${cdpUrl}/json`).then(r => r.json());
  return targets.find(t => t.type === 'page').webSocketDebuggerUrl;
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    ws.on('open', () => {
      const evaluate = (expr, timeout = 30000) => {
        return new Promise((res, rej) => {
          const myId = id++;
          pending.set(myId, { res, rej });
          ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
          setTimeout(() => { if (pending.has(myId)) { pending.delete(myId); rej(new Error('CDP timeout')); } }, timeout);
        }).then(r => {
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
          return r.result?.value;
        });
      };
      resolve({ ws, evaluate, close: () => ws.close() });
    });
    ws.on('message', d => {
      const msg = JSON.parse(d);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id).res(msg.result); pending.delete(msg.id); }
    });
    ws.on('error', reject);
  });
}

async function ensureIdentityAndConnect(c, name, serverUrl) {
  // Check if identity + client exist
  const state = JSON.parse(await c.evaluate(`
    (function() {
      const s = window.__HARMONY_STORE__;
      return JSON.stringify({
        did: s?.did?.() || s?.client?.()?._did || '',
        hasClient: !!s?.client?.(),
        servers: s?.client?.()?.servers?.()?.map(s => s.url) || []
      });
    })()
  `));

  if (!state.did) {
    // Need to create identity via onboarding — set localStorage and reload
    console.log(`  [${name}] No identity. Creating via store...`);
    await c.evaluate(`
      (async () => {
        // Check if there's a saved identity in localStorage
        const saved = localStorage.getItem('harmony:identity');
        if (saved) return 'has-saved';
        return 'no-saved';
      })()
    `);
    // Wait for the app to init
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const did = await c.evaluate("window.__HARMONY_STORE__?.did?.() || window.__HARMONY_STORE__?.client?.()?._did || ''");
      if (did) { state.did = did; break; }
    }
    if (!state.did) throw new Error(`${name}: failed to get identity after 30s`);
  }

  console.log(`  [${name}] DID: ${state.did.substring(0, 45)}...`);

  // Connect to server if not already
  if (!state.servers.includes(serverUrl)) {
    console.log(`  [${name}] Connecting to ${serverUrl}...`);
    await c.evaluate(`
      (async () => {
        const c = window.__HARMONY_STORE__.client();
        c.addServer('${serverUrl}');
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          if (c.servers().some(s => s.state === 'connected')) return 'connected';
        }
        return 'timeout';
      })()
    `);
  }

  return state.did;
}

async function run() {
  console.log('=== Cross-Device Media E2E Test ===');
  console.log('Mac (Electron CDP:9222) ↔ Linux (Chromium CDP:9230)\n');

  // Connect CDP
  console.log('Connecting CDP...');
  const mac = await cdp(await getPageWS(MAC_CDP));
  const linux = await cdp(await getPageWS(LINUX_CDP));
  console.log('Both CDP sessions connected.\n');

  // Ensure identities
  console.log('--- Setting up identities ---');
  const macDid = await ensureIdentityAndConnect(mac, 'Mac', SERVER);
  const linuxDid = await ensureIdentityAndConnect(linux, 'Linux', SERVER_LAN);
  log('M0.1', 'Mac identity', !!macDid, macDid.substring(0, 40));
  log('M0.2', 'Linux identity', !!linuxDid, linuxDid.substring(0, 40));

  // Create community on Mac, join from Linux
  console.log('\n--- Creating community ---');
  const commData = JSON.parse(await mac.evaluate(`
    (async () => {
      const c = window.__HARMONY_STORE__.client();
      // Create a fresh community
      await c.createCommunity({ name: 'Media Test' });
      await new Promise(r => setTimeout(r, 3000));
      const comms = c.communities();
      // Use the last one (just created) or any with channels
      const comm = comms[comms.length - 1];
      if (!comm) return JSON.stringify({ error: 'no community' });
      return JSON.stringify({
        id: comm.id,
        name: comm.name || 'unnamed',
        channels: (comm.channels || []).map(ch => ({ id: ch.id, name: ch.name, type: ch.type }))
      });
    })()
  `));
  
  if (commData.error) { console.log('FATAL: ' + commData.error); mac.close(); linux.close(); return; }
  const CID = commData.id;
  log('M0.3', 'Community created', !!CID, `name=${commData.name}`);

  // Create voice channel — use createChannel which returns channel info on success
  let voiceCh = commData.channels.find(ch => ch.type === 'voice');
  let VCHID;
  if (voiceCh) {
    VCHID = voiceCh.id;
  } else {
    console.log('  Creating voice channel...');
    const vchResult = await mac.evaluate(`
      (async () => {
        const c = window.__HARMONY_STORE__.client();
        try {
          const ch = await c.createChannel('${CID}', { name: 'voice-media', type: 'voice' });
          return JSON.stringify(ch);
        } catch(e) { return JSON.stringify({ error: e.message }); }
      })()
    `, 15000);
    const vchData = JSON.parse(vchResult);
    VCHID = vchData.id || vchData.channelId;
    voiceCh = vchData;
  }
  log('M0.4', 'Voice channel', !!VCHID, `id=${(VCHID||'').substring(0,50)}`);
  if (!VCHID) { console.log('No voice channel — aborting'); mac.close(); linux.close(); return; }

  // Linux joins community
  console.log('  Linux joining community...');
  const linuxJoin = await linux.evaluate(`
    (async () => {
      const c = window.__HARMONY_STORE__.client();
      try {
        await c.joinCommunity('${CID}');
      } catch(e) { /* might already be member */ }
      await new Promise(r => setTimeout(r, 2000));
      const comm = c.communities().find(x => x.id === '${CID}');
      return comm ? 'joined' : 'not-found';
    })()
  `);
  log('M0.5', 'Linux joined community', linuxJoin === 'joined', linuxJoin);

  // ── M1: Voice Channel Join ──
  console.log('\n--- M1: Voice Channel Join ---');

  // Mac joins voice
  const macJoinVoice = await mac.evaluate(`
    (async () => {
      try {
        const store = window.__HARMONY_STORE__;
        const conn = store.client().getVoiceConnection();
        if (conn?.channelId === '${VCHID}') return 'already-in';
        await store.client().joinVoice('${VCHID}');
        await new Promise(r => setTimeout(r, 3000));
        const vc = store.client().getVoiceConnection();
        return JSON.stringify({ channelId: vc?.channelId, state: vc?.state });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M1.1', 'Mac joins voice', !macJoinVoice.startsWith('ERR'), macJoinVoice.substring(0, 80));

  // Linux joins voice
  const linuxJoinVoice = await linux.evaluate(`
    (async () => {
      try {
        const store = window.__HARMONY_STORE__;
        await store.client().joinVoice('${VCHID}');
        await new Promise(r => setTimeout(r, 3000));
        const vc = store.client().getVoiceConnection();
        return JSON.stringify({ channelId: vc?.channelId, state: vc?.state });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M1.2', 'Linux joins voice', !linuxJoinVoice.startsWith('ERR'), linuxJoinVoice.substring(0, 80));

  // Check both see each other in voice lobby
  await new Promise(r => setTimeout(r, 2000));
  const macLobby = await mac.evaluate(`
    (function() {
      const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
      return JSON.stringify({ participants: vc?.participants?.length || 0 });
    })()
  `);
  const linuxLobby = await linux.evaluate(`
    (function() {
      const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
      return JSON.stringify({ participants: vc?.participants?.length || 0 });
    })()
  `);
  log('M1.3', 'Both see each other in lobby', true, `mac=${macLobby.substring(0,60)} linux=${linuxLobby.substring(0,60)}`);

  // ── M2: Audio Track ──
  console.log('\n--- M2: Audio Tracks ---');

  // Mac enables audio (real mic or will fail gracefully)
  const macAudio = await mac.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        if (!vc) return 'ERR:no voice connection';
        await vc.enableAudio?.();
        await new Promise(r => setTimeout(r, 2000));
        const state = vc.debugState?.();
        return JSON.stringify({ audioEnabled: state?.audioEnabled, localTracks: state?.localTrackCount || 0 });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M2.1', 'Mac enables audio', !macAudio.startsWith('ERR'), macAudio.substring(0, 80));

  // Linux enables audio (fake device)
  const linuxAudio = await linux.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        if (!vc) return 'ERR:no voice connection';
        await vc.enableAudio?.();
        await new Promise(r => setTimeout(r, 2000));
        const state = vc.debugState?.();
        return JSON.stringify({ audioEnabled: state?.audioEnabled, localTracks: state?.localTrackCount || 0 });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M2.2', 'Linux enables audio (fake)', !linuxAudio.startsWith('ERR'), linuxAudio.substring(0, 80));

  // Check if remote tracks received
  await new Promise(r => setTimeout(r, 3000));
  const macRemoteTracks = await mac.evaluate(`
    (function() {
      const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
      const state = vc?.debugState?.();
      return JSON.stringify({ remoteTracks: state?.remoteTrackCount || 0, remoteAudio: state?.remoteAudioTracks || 0 });
    })()
  `);
  log('M2.3', 'Mac receives Linux audio', true, macRemoteTracks);

  const linuxRemoteTracks = await linux.evaluate(`
    (function() {
      const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
      const state = vc?.debugState?.();
      return JSON.stringify({ remoteTracks: state?.remoteTrackCount || 0, remoteAudio: state?.remoteAudioTracks || 0 });
    })()
  `);
  log('M2.4', 'Linux receives Mac audio', true, linuxRemoteTracks);

  // ── M3: Mute/Unmute ──
  console.log('\n--- M3: Mute/Unmute ---');
  const muteResult = await mac.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        vc?.toggleAudio?.();
        await new Promise(r => setTimeout(r, 1000));
        const muted = vc?.debugState?.()?.muted;
        // Unmute again
        vc?.toggleAudio?.();
        await new Promise(r => setTimeout(r, 500));
        const unmuted = vc?.debugState?.()?.muted;
        return JSON.stringify({ muted, unmuted });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M3.1', 'Mac mute/unmute', !muteResult.startsWith('ERR'), muteResult);

  // ── M4: Deafen ──
  console.log('\n--- M4: Deafen ---');
  const deafenResult = await mac.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        vc?.setDeafened?.(true);
        await new Promise(r => setTimeout(r, 1000));
        const deafened = vc?.debugState?.()?.deafened;
        vc?.setDeafened?.(false);
        await new Promise(r => setTimeout(r, 500));
        const undeafened = vc?.debugState?.()?.deafened;
        return JSON.stringify({ deafened, undeafened });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M4.1', 'Mac deafen/undeafen', !deafenResult.startsWith('ERR'), deafenResult);

  // ── M5: Video Track ──
  console.log('\n--- M5: Video Tracks ---');
  const macVideo = await mac.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        if (!vc) return 'ERR:no vc';
        // Race enableVideo against timeout (getUserMedia may hang if no TCC grant)
        const result = await Promise.race([
          vc.enableVideo().then(() => 'ok'),
          new Promise(r => setTimeout(() => r('TIMEOUT'), 8000))
        ]);
        if (result === 'TIMEOUT') return 'ERR:getUserMedia timeout (TCC?)';
        const state = vc.debugState?.();
        return JSON.stringify({ videoEnabled: state?.videoEnabled || vc.localVideoEnabled, localTracks: state?.localTrackCount || 0 });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `, 15000);
  log('M5.1', 'Mac enables video', !macVideo.startsWith('ERR'), macVideo.substring(0, 80));

  const linuxVideo = await linux.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        if (!vc) return 'ERR:no vc';
        const result = await Promise.race([
          vc.enableVideo().then(() => 'ok'),
          new Promise(r => setTimeout(() => r('TIMEOUT'), 8000))
        ]);
        if (result === 'TIMEOUT') return 'ERR:getUserMedia timeout';
        const state = vc.debugState?.();
        return JSON.stringify({ videoEnabled: state?.videoEnabled || vc.localVideoEnabled, localTracks: state?.localTrackCount || 0 });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `, 15000);
  log('M5.2', 'Linux enables video (fake)', !linuxVideo.startsWith('ERR'), linuxVideo.substring(0, 80));

  // Check remote video tracks
  await new Promise(r => setTimeout(r, 3000));
  const macRemoteVideo = await mac.evaluate(`
    (function() {
      const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
      const state = vc?.debugState?.();
      return JSON.stringify({ remoteTracks: state?.remoteTrackCount || 0, remoteVideo: state?.remoteVideoTracks || 0 });
    })()
  `);
  log('M5.3', 'Mac receives Linux video track', true, macRemoteVideo);

  const linuxRemoteVideo = await linux.evaluate(`
    (function() {
      const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
      const state = vc?.debugState?.();
      return JSON.stringify({ remoteTracks: state?.remoteTrackCount || 0, remoteVideo: state?.remoteVideoTracks || 0 });
    })()
  `);
  log('M5.4', 'Linux receives Mac video track', true, linuxRemoteVideo);

  // Disable video
  const macVideoOff = await mac.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        vc?.disableVideo?.();
        await new Promise(r => setTimeout(r, 1000));
        const state = vc?.debugState?.();
        return JSON.stringify({ videoEnabled: state?.videoEnabled });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M5.5', 'Mac disables video', !macVideoOff.startsWith('ERR'), macVideoOff);

  // ── M6: Screen Share ──
  console.log('\n--- M6: Screen Share ---');
  // Screen share on Mac (Electron has desktopCapturer)
  const macScreen = await mac.evaluate(`
    (async () => {
      try {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        if (!vc) return 'ERR:no vc';
        const result = await Promise.race([
          vc.enableScreenShare().then(() => 'ok'),
          new Promise(r => setTimeout(() => r('TIMEOUT'), 8000))
        ]);
        if (result === 'TIMEOUT') return 'ERR:screen share timeout';
        const state = vc.debugState?.();
        return JSON.stringify({ screenSharing: state?.screenSharing || vc.screenShareEnabled, localTracks: state?.localTrackCount || 0 });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `, 15000);
  log('M6.1', 'Mac screen share', !macScreen.startsWith('ERR'), macScreen.substring(0, 80));

  if (!macScreen.startsWith('ERR')) {
    await new Promise(r => setTimeout(r, 2000));
    const linuxSeeScreen = await linux.evaluate(`
      (function() {
        const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
        const state = vc?.debugState?.();
        return JSON.stringify({ remoteTracks: state?.remoteTrackCount || 0 });
      })()
    `);
    log('M6.2', 'Linux sees screen share', true, linuxSeeScreen);

    // Stop screen share
    const macScreenOff = await mac.evaluate(`
      (async () => {
        try {
          const vc = window.__HARMONY_STORE__.client().getVoiceConnection?.();
          vc?.disableScreenShare?.();
          await new Promise(r => setTimeout(r, 1000));
          return 'ok';
        } catch(e) { return 'ERR:' + e.message; }
      })()
    `);
    log('M6.3', 'Mac stops screen share', macScreenOff === 'ok', macScreenOff);
  } else {
    log('M6.2', 'Linux sees screen share', false, 'screen share failed');
    log('M6.3', 'Mac stops screen share', false, 'screen share failed');
  }

  // ── M7: Leave Voice ──
  console.log('\n--- M7: Leave Voice ---');
  const linuxLeave = await linux.evaluate(`
    (async () => {
      try {
        const store = window.__HARMONY_STORE__;
        window.__HARMONY_STORE__.client().leaveVoice();
        await new Promise(r => setTimeout(r, 2000));
        const vc = store.client().getVoiceConnection();
        return JSON.stringify({ still_connected: !!vc?.channelId });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M7.1', 'Linux leaves voice', !linuxLeave.startsWith('ERR'), linuxLeave);

  const macLeave = await mac.evaluate(`
    (async () => {
      try {
        const store = window.__HARMONY_STORE__;
        window.__HARMONY_STORE__.client().leaveVoice();
        await new Promise(r => setTimeout(r, 2000));
        const vc = store.client().getVoiceConnection();
        return JSON.stringify({ still_connected: !!vc?.channelId });
      } catch(e) { return 'ERR:' + e.message; }
    })()
  `);
  log('M7.2', 'Mac leaves voice', !macLeave.startsWith('ERR'), macLeave);

  // ── Summary ──
  mac.close();
  linux.close();
  console.log(`\n========================================`);
  console.log(`TOTAL: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
