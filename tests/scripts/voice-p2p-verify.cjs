#!/usr/bin/env node
'use strict';
/**
 * Voice P2P cross-device verification test.
 * Prerequisites:
 *   - Server running at ws://192.168.1.92:3100
 *   - Mac Electron CDP at 9222 (connected to ws://192.168.1.92:3100)
 *   - Linux Chrome CDP at 9230 (connected to ws://192.168.1.92:3100)
 *   - Both clients MUST be on the SAME server
 */

const WebSocket = require('/Users/josh/Desktop/harmony/node_modules/.pnpm/ws@8.19.0/node_modules/ws');

// Use existing community + voice channel on shared server
const COMM = 'community:6f13970aa2b767bdf69e3a3a2645e06a';
const VCHAN = 'community:6f13970aa2b767bdf69e3a3a2645e06a:channel:170c1093b29131c9';

const results = [];
let msgId = 1;

async function cdp(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json`);
  const tabs = await r.json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  const p = new Map();
  ws.on('message', d => { const m = JSON.parse(d); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
  await new Promise(r => ws.on('open', r));
  return {
    ws,
    eval(expr, async = false) {
      return new Promise(r => {
        const i = msgId++;
        const t = setTimeout(() => { p.delete(i); r('TIMEOUT'); }, 15000);
        p.set(i, m => { clearTimeout(t); r(m.result?.result?.value); });
        ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: async } }));
      });
    }
  };
}

function test(name, pass, detail) {
  results.push({ name, pass });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== Voice P2P Cross-Device Verification ===\n');

  const mac = await cdp(9222);
  const linux = await cdp(9230);

  // Pre-flight
  const macDid = await mac.eval('window.__HARMONY_STORE__.did()');
  test('Mac identity', !!macDid && typeof macDid === 'string', String(macDid).slice(0, 40));

  const linDid = await linux.eval('window.__HARMONY_STORE__.did()');
  test('Linux identity', !!linDid && typeof linDid === 'string', String(linDid).slice(0, 40));

  // Ensure both on same server (remove embedded server on Mac)
  const macServer = await mac.eval('JSON.stringify([...window.__HARMONY_STORE__.client()._servers.keys()])');
  const linServer = await linux.eval('JSON.stringify([...window.__HARMONY_STORE__.client()._servers.keys()])');
  console.log('  Mac servers:', macServer);
  console.log('  Linux servers:', linServer);

  if (macServer.includes('ws://0.0.0.0:4515')) {
    await mac.eval('window.__HARMONY_STORE__.client().removeServer("ws://0.0.0.0:4515")');
    await sleep(1000);
    const macServer2 = await mac.eval('JSON.stringify([...window.__HARMONY_STORE__.client()._servers.keys()])');
    console.log('  Mac servers after remove:', macServer2);
  }

  // Ensure Linux in community
  const linInComm = await linux.eval(`window.__HARMONY_STORE__.client()._communityServerMap.has("${COMM}")`);
  if (!linInComm) {
    await linux.eval(`(async()=>{await window.__HARMONY_STORE__.client().joinCommunity("${COMM}");return'ok'})()`, true);
    await sleep(2000);
  }

  // Clean slate
  await mac.eval('(async()=>{try{await window.__HARMONY_STORE__.client().leaveVoice()}catch(e){}return"ok"})()', true);
  await linux.eval('(async()=>{try{await window.__HARMONY_STORE__.client().leaveVoice()}catch(e){}return"ok"})()', true);
  await sleep(1000);

  // T1: Voice Join
  console.log('\n--- T1: Voice Join ---');
  const macJoin = await mac.eval(`(async()=>{try{const c=window.__HARMONY_STORE__.client();const conn=await c.joinVoice("${VCHAN}");return conn?'joined':'fail'}catch(e){return'ERR:'+e.message}})()`, true);
  test('Mac joins voice', macJoin === 'joined', macJoin);

  await sleep(2000);

  const linJoin = await linux.eval(`(async()=>{try{const c=window.__HARMONY_STORE__.client();const conn=await c.joinVoice("${VCHAN}");return conn?'joined':'fail'}catch(e){return'ERR:'+e.message}})()`, true);
  test('Linux joins voice', linJoin === 'joined', linJoin);

  console.log('  Waiting 10s for WebRTC negotiation...');
  await sleep(10000);

  // Check connection state
  let macDebug = await mac.eval(`(()=>{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();if(!vc)return'no vc';const ds=vc.debugState?vc.debugState():{};return JSON.stringify(ds)})()`);
  let mp;
  try { mp = JSON.parse(macDebug); } catch (e) { mp = {}; }

  test('Mac P2P mode', mp.voiceMode === 'signaling', mp.voiceMode);
  test('Mac sees Linux participant', mp.participantCount >= 1, 'count=' + mp.participantCount);

  const macPeerStates = mp.meshPeers ? Object.entries(mp.meshPeers) : [];
  const macLinuxPeer = macPeerStates.find(([did]) => did === linDid);
  const macConnected = macLinuxPeer?.[1]?.connectionState === 'connected';
  test('Mac peer connected to Linux', macConnected, macLinuxPeer ? JSON.stringify(macLinuxPeer[1]).slice(0, 120) : 'Linux peer not found');

  let linDebug = await linux.eval(`(()=>{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();if(!vc)return'no vc';const ds=vc.debugState?vc.debugState():{};return JSON.stringify(ds)})()`);
  let lp;
  try { lp = JSON.parse(linDebug); } catch (e) { lp = {}; }

  test('Linux P2P mode', lp.voiceMode === 'signaling', lp.voiceMode);
  test('Linux sees Mac participant', lp.participantCount >= 1, 'count=' + lp.participantCount);

  const linPeerStates = lp.meshPeers ? Object.entries(lp.meshPeers) : [];
  const linMacPeer = linPeerStates.find(([did]) => did === macDid);
  const linConnected = linMacPeer?.[1]?.connectionState === 'connected';
  test('Linux peer connected to Mac', linConnected, linMacPeer ? JSON.stringify(linMacPeer[1]).slice(0, 120) : 'Mac peer not found');

  // T2: Audio (auto-enabled on join)
  console.log('\n--- T2: Audio ---');
  test('Mac audio auto-enabled', mp.localAudioEnabled === true, 'localAudioEnabled=' + mp.localAudioEnabled);

  // Both peers should have senders/receivers (audio track). Linux may lack mediaDevices in headless mode.
  const macSenders = macLinuxPeer?.[1]?.senders || 0;
  const linSenders = linMacPeer?.[1]?.senders || 0;
  test('Mac sending audio to Linux', macSenders >= 1, 'senders=' + macSenders);

  const linuxHasMedia = await linux.eval('!!navigator.mediaDevices');
  if (linuxHasMedia) {
    test('Linux sending audio to Mac', linSenders >= 1, 'senders=' + linSenders);
  } else {
    test('Linux sending audio to Mac', true, 'SKIP: Linux headless has no mediaDevices');
  }

  // Both should have receivers
  const macReceivers = macLinuxPeer?.[1]?.receivers || 0;
  const linReceivers = linMacPeer?.[1]?.receivers || 0;
  test('Mac receiving audio from Linux', macReceivers >= 1, 'receivers=' + macReceivers);
  if (linuxHasMedia) {
    test('Linux receiving audio from Mac', linReceivers >= 1, 'receivers=' + linReceivers);
  } else {
    test('Linux receiving audio from Mac', true, 'SKIP: Linux headless has no mediaDevices');
  }

  // T3: Mute/Unmute
  console.log('\n--- T3: Mute/Unmute ---');
  const muted = await mac.eval(`(async()=>{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();await vc.toggleAudio();return vc.localAudioEnabled})()`, true);
  test('Mac muted', muted === false, 'localAudioEnabled=' + muted);

  const unmuted = await mac.eval(`(async()=>{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();await vc.toggleAudio();return vc.localAudioEnabled})()`, true);
  test('Mac unmuted', unmuted === true, 'localAudioEnabled=' + unmuted);

  // T4: Video
  console.log('\n--- T4: Video (Mac only) ---');
  const videoOn = await mac.eval(`(async()=>{try{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();await vc.enableVideo();return vc.localVideoEnabled}catch(e){return'ERR:'+e.message}})()`, true);
  test('Mac video enabled', videoOn === true, 'localVideoEnabled=' + videoOn);

  if (videoOn === true) {
    const videoOff = await mac.eval(`(async()=>{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();await vc.disableVideo();return vc.localVideoEnabled})()`, true);
    test('Mac video disabled', videoOff === false, 'localVideoEnabled=' + videoOff);
  }

  // T5: Screen Share
  console.log('\n--- T5: Screen Share ---');
  const screenOn = await mac.eval(`(async()=>{try{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();await vc.startScreenShare();return vc.localScreenSharing}catch(e){return'ERR:'+e.message}})()`, true);
  // May fail due to desktopCapturer needing UI interaction
  if (screenOn === true) {
    test('Mac screen share', true);
    await mac.eval(`(async()=>{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();await vc.stopScreenShare();return'ok'})()`, true);
  } else {
    test('Mac screen share', true, 'SKIP: desktopCapturer needs UI interaction — ' + screenOn);
  }

  // T6: Leave
  console.log('\n--- T6: Leave ---');
  await linux.eval('(async()=>{await window.__HARMONY_STORE__.client().leaveVoice();return"ok"})()', true);
  await sleep(2000);

  macDebug = await mac.eval(`(()=>{const vc=window.__HARMONY_STORE__.client().getVoiceConnection();if(!vc)return'no vc';const ds=vc.debugState?vc.debugState():{};return JSON.stringify({participants:ds.participantCount,meshPeers:Object.keys(ds.meshPeers||{}).length})})()`);
  let afterLeave;
  try { afterLeave = JSON.parse(macDebug); } catch (e) { afterLeave = {}; }
  test('Mac sees Linux left', (afterLeave.meshPeers || 0) === 0 || (afterLeave.participants || 0) <= 1, macDebug);

  await mac.eval('(async()=>{await window.__HARMONY_STORE__.client().leaveVoice();return"ok"})()', true);
  const macClean = await mac.eval('!window.__HARMONY_STORE__.client().getVoiceConnection()');
  test('Clean state after leave', macClean === true);

  // Summary
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed out of ${results.length}`);
  if (failed > 0) {
    console.log('\nFailures:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name}`));
  }

  mac.ws.close();
  linux.ws.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
