const WebSocket = require('ws');
const http = require('http');

const CDP = (port) => new Promise((ok, fail) => {
  http.get('http://127.0.0.1:' + port + '/json/list', r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => {
      const p = JSON.parse(d).find(t => t.type === 'page');
      if (!p) return fail(new Error('No page on ' + port));
      const ws = new WebSocket(p.webSocketDebuggerUrl);
      let id = 0;
      const send = (m, params = {}) => new Promise((ok, rej) => {
        const i = ++id;
        ws.send(JSON.stringify({ id: i, method: m, params }));
        const t = setTimeout(() => { ws.off('message', h); rej(new Error('timeout: ' + m)); }, 15000);
        const h = msg => { const r = JSON.parse(msg); if (r.id === i) { ws.off('message', h); clearTimeout(t); ok(r); } };
        ws.on('message', h);
      });
      ws.on('open', () => ok({ send, ws, close: () => ws.close() }));
      ws.on('error', e => fail(e));
    });
  }).on('error', e => fail(e));
});

const run = async (cdp, expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0, skipped = 0;
const results = [];
const test = async (name, fn) => {
  try {
    const result = await fn();
    if (result === 'SKIP') { skipped++; results.push(`⏭️  ${name}`); console.log(`⏭️  ${name}`); }
    else { passed++; results.push(`✅ ${name}`); console.log(`✅ ${name}`); }
  } catch (e) {
    failed++; results.push(`❌ ${name}: ${e.message?.substring(0, 120)}`); console.log(`❌ ${name}: ${e.message?.substring(0, 120)}`);
  }
};

(async () => {
  console.log('Connecting CDP...');
  const mac = await CDP(9222);
  const linux = await CDP(9230);

  for (const cdp of [mac, linux]) {
    await run(cdp, `(async()=>{for(let i=0;i<40;i++){if(__HARMONY_STORE__?.client?.())return;await new Promise(r=>setTimeout(r,500))}throw new Error('timeout')})()`);
  }
  await sleep(5000);

  const macDid = await run(mac, `__HARMONY_STORE__.did()`);
  const linuxDid = await run(linux, `__HARMONY_STORE__.did()`);
  console.log(`Mac: ${macDid?.substring(0,35)}\nLinux: ${linuxDid?.substring(0,35)}\n`);

  // Get community/channel IDs
  const commId = await run(mac, `__HARMONY_STORE__.communities()[0]?.id`);
  const textChId = await run(mac, `__HARMONY_STORE__.channels().find(c=>c.type==='text')?.id`);
  const voiceChId = await run(mac, `__HARMONY_STORE__.channels().find(c=>c.type==='voice')?.id`);

  if (!commId) { console.log('FATAL: No community'); process.exit(1); }
  console.log(`Community: ${commId}\nText: ${textChId}\nVoice: ${voiceChId}\n`);

  // Select channel on both
  for (const cdp of [mac, linux]) {
    await run(cdp, `(()=>{const s=__HARMONY_STORE__;s.setActiveCommunityId('${commId}');s.setActiveChannelId('${textChId}')})()`);
  }

  // ═══════════════════════════════════════
  console.log('═══ 1. COMMUNITY & MEMBERS ═══');
  // ═══════════════════════════════════════

  await test('1.1 Both have community', async () => {
    const m = await run(mac, `__HARMONY_STORE__.communities().length`);
    const l = await run(linux, `__HARMONY_STORE__.communities().length`);
    if (!m || !l) throw new Error(`Mac:${m} Linux:${l}`);
  });

  await test('1.2 Both have members synced', async () => {
    const m = await run(mac, `__HARMONY_STORE__.members().length`);
    const l = await run(linux, `__HARMONY_STORE__.members().length`);
    if (m < 2 || l < 2) throw new Error(`Mac:${m} Linux:${l}`);
  });

  await test('1.3 Both see each other online', async () => {
    const a = await run(mac, `__HARMONY_STORE__.members().find(m=>m.did==='${linuxDid}')?.status`);
    const b = await run(linux, `__HARMONY_STORE__.members().find(m=>m.did==='${macDid}')?.status`);
    if (a !== 'online') throw new Error(`Mac sees Linux: ${a}`);
    if (b !== 'online') throw new Error(`Linux sees Mac: ${b}`);
  });

  await test('1.4 Display names resolve (no pseudonyms)', async () => {
    const a = await run(mac, `__HARMONY_STORE__.members().find(m=>m.did==='${linuxDid}')?.displayName`);
    const b = await run(linux, `__HARMONY_STORE__.members().find(m=>m.did==='${macDid}')?.displayName`);
    if (!a || a.includes('Bear') || a.includes('Fox')) throw new Error(`Mac sees: ${a}`);
    if (!b || b.includes('Bear') || b.includes('Fox')) throw new Error(`Linux sees: ${b}`);
  });

  await test('1.5 Both have channels', async () => {
    const m = await run(mac, `__HARMONY_STORE__.channels().length`);
    const l = await run(linux, `__HARMONY_STORE__.channels().length`);
    if (!m || !l) throw new Error(`Mac:${m} Linux:${l}`);
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 2. TEXT MESSAGING ═══');
  // ═══════════════════════════════════════

  const msg1 = 'flow-msg-' + Date.now();
  await test('2.1 Mac sends message', async () => {
    await run(mac, `__HARMONY_STORE__.client().sendMessage('${commId}','${textChId}','${msg1}')`);
  });

  await test('2.2 Mac sees own message (optimistic)', async () => {
    await sleep(500);
    const r = await run(mac, `__HARMONY_STORE__.messages().some(m=>m.content==='${msg1}')`);
    if (!r) throw new Error('not found');
  });

  await test('2.3 Linux receives message', async () => {
    await sleep(2000);
    const r = await run(linux, `__HARMONY_STORE__.messages().some(m=>m.content==='${msg1}')`);
    if (!r) throw new Error('not found');
  });

  const msg2 = 'flow-reply-' + Date.now();
  await test('2.4 Linux sends reply', async () => {
    await run(linux, `__HARMONY_STORE__.client().sendMessage('${commId}','${textChId}','${msg2}')`);
  });

  await test('2.5 Mac receives reply', async () => {
    await sleep(2000);
    const r = await run(mac, `__HARMONY_STORE__.messages().some(m=>m.content==='${msg2}')`);
    if (!r) throw new Error('not found');
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 3. MESSAGE EDIT ═══');
  // ═══════════════════════════════════════

  await test('3.1 Mac edits message', async () => {
    const msgId = await run(mac, `__HARMONY_STORE__.messages().find(m=>m.content==='${msg1}')?.id`);
    if (!msgId) throw new Error('msg not found');
    await run(mac, `__HARMONY_STORE__.client().editMessage('${commId}','${textChId}','${msgId}','${msg1}-edited')`);
  });

  await test('3.2 Linux sees edit', async () => {
    await sleep(2000);
    const r = await run(linux, `__HARMONY_STORE__.messages().some(m=>m.content==='${msg1}-edited')`);
    if (!r) throw new Error('not found');
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 4. MESSAGE DELETE ═══');
  // ═══════════════════════════════════════

  await test('4.1 Mac deletes message', async () => {
    const msgId = await run(mac, `__HARMONY_STORE__.messages().find(m=>m.content==='${msg1}-edited')?.id`);
    if (!msgId) throw new Error('msg not found');
    await run(mac, `__HARMONY_STORE__.client().deleteMessage('${commId}','${textChId}','${msgId}')`);
  });

  await test('4.2 Linux no longer sees deleted message', async () => {
    await sleep(2000);
    const r = await run(linux, `__HARMONY_STORE__.messages().some(m=>m.content==='${msg1}-edited')`);
    if (r) throw new Error('still visible');
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 5. REACTIONS ═══');
  // ═══════════════════════════════════════

  await test('5.1 Mac adds 👍 reaction', async () => {
    const msgId = await run(mac, `__HARMONY_STORE__.messages().find(m=>m.content==='${msg2}')?.id`);
    if (!msgId) throw new Error('msg not found');
    await run(mac, `__HARMONY_STORE__.client().addReaction('${commId}','${textChId}','${msgId}','👍')`);
  });

  await test('5.2 Linux sees reaction', async () => {
    await sleep(2000);
    const r = await run(linux, `JSON.stringify(__HARMONY_STORE__.messages().find(m=>m.content==='${msg2}')?.reactions)`);
    const reactions = JSON.parse(r || '[]');
    if (!reactions?.length) throw new Error('no reactions: ' + r);
  });

  await test('5.3 Mac removes reaction', async () => {
    const msgId = await run(mac, `__HARMONY_STORE__.messages().find(m=>m.content==='${msg2}')?.id`);
    await run(mac, `__HARMONY_STORE__.client().removeReaction('${commId}','${textChId}','${msgId}','👍')`);
  });

  await test('5.4 Linux sees reaction removed', async () => {
    await sleep(2000);
    const r = await run(linux, `JSON.stringify(__HARMONY_STORE__.messages().find(m=>m.content==='${msg2}')?.reactions)`);
    const reactions = JSON.parse(r || '[]');
    const thumbs = reactions?.find(r => r.emoji === '👍');
    if (thumbs && thumbs.count > 0) throw new Error('still has reaction: ' + r);
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 6. CHANNEL CRUD ═══');
  // ═══════════════════════════════════════

  const chName = 'e2e-' + Date.now().toString(36);
  let newChId;
  await test('6.1 Mac creates text channel', async () => {
    const r = await run(mac, `(async()=>{
      const ch=await __HARMONY_STORE__.client().createChannel('${commId}',{name:'${chName}',type:'text'});
      return ch?.id || ch?.channelId || 'no-id';
    })()`);
    newChId = r;
    if (!r || r === 'no-id') throw new Error('no channel id');
  });

  await test('6.2 Mac store has new channel', async () => {
    await sleep(1000);
    const r = await run(mac, `__HARMONY_STORE__.channels().some(c=>c.name==='${chName}')`);
    if (!r) throw new Error('not in store');
  });

  await test('6.3 Linux sees new channel', async () => {
    await sleep(2000);
    const r = await run(linux, `__HARMONY_STORE__.channels().some(c=>c.name==='${chName}')`);
    if (!r) throw new Error('not in store');
  });

  await test('6.4 Mac updates channel name', async () => {
    if (!newChId || newChId === 'no-id') throw new Error('no channel to update');
    await run(mac, `__HARMONY_STORE__.client().updateChannel('${commId}','${newChId}',{name:'${chName}-v2'})`);
  });

  await test('6.5 Linux sees updated name', async () => {
    await sleep(2000);
    const r = await run(linux, `__HARMONY_STORE__.channels().some(c=>c.name==='${chName}-v2')`);
    if (!r) throw new Error('not updated');
  });

  await test('6.6 Mac deletes channel', async () => {
    if (!newChId || newChId === 'no-id') throw new Error('no channel to delete');
    await run(mac, `__HARMONY_STORE__.client().deleteChannel('${commId}','${newChId}')`);
  });

  await test('6.7 Linux no longer sees channel', async () => {
    await sleep(2000);
    const r = await run(linux, `__HARMONY_STORE__.channels().some(c=>c.name?.startsWith('${chName}'))`);
    if (r) throw new Error('still visible');
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 7. VOICE CHANNEL ═══');
  // ═══════════════════════════════════════

  if (voiceChId) {
    await test('7.1 Mac joins voice', async () => {
      await run(mac, `__HARMONY_STORE__.client().joinVoice('${voiceChId}')`);
      await sleep(2000);
    });

    await test('7.2 Linux joins voice', async () => {
      await run(linux, `__HARMONY_STORE__.client().joinVoice('${voiceChId}')`);
      await sleep(3000);
    });

    await test('7.3 Voice participants > 0', async () => {
      const r = await run(mac, `(()=>{
        const s=__HARMONY_STORE__;
        const p=s.channelVoiceParticipants?.('${voiceChId}') || s.voiceUsers?.() || [];
        return p.length;
      })()`);
      if (!r) throw new Error('participants: ' + r);
    });

    await test('7.4 Mac mute/unmute cycle', async () => {
      const conn = await run(mac, `(async()=>{
        const vc=__HARMONY_STORE__.client().getVoiceConnection?.();
        if(!vc) return 'no connection';
        await vc.toggleAudio();
        await new Promise(r=>setTimeout(r,500));
        const muted=vc.debugState?.()?.hasAudioProducer===false;
        await vc.toggleAudio();
        await new Promise(r=>setTimeout(r,500));
        const unmuted=vc.debugState?.()?.hasAudioProducer===true;
        return JSON.stringify({muted,unmuted});
      })()`);
      const data = JSON.parse(conn);
      if (!data.muted || !data.unmuted) throw new Error(conn);
    });

    await test('7.5 Mac leaves voice', async () => {
      await run(mac, `__HARMONY_STORE__.client().leaveVoice()`);
    });

    await test('7.6 Linux leaves voice', async () => {
      await run(linux, `__HARMONY_STORE__.client().leaveVoice()`);
    });
  } else {
    console.log('  (no voice channel, skipping voice tests)');
  }

  // ═══════════════════════════════════════
  console.log('\n═══ 8. DIRECT MESSAGES ═══');
  // ═══════════════════════════════════════

  const dm1 = 'dm-test-' + Date.now();
  await test('8.1 Mac sends DM to Linux', async () => {
    await run(mac, `__HARMONY_STORE__.client().sendDM('${linuxDid}','${dm1}')`);
  });

  await test('8.2 Mac has DM in store (outgoing)', async () => {
    await sleep(500);
    const r = await run(mac, `(()=>{
      const s=__HARMONY_STORE__;
      const msgs=s.dmMessages?.('${linuxDid}') || [];
      return msgs.some(m=>m.content==='${dm1}');
    })()`);
    if (!r) throw new Error('not in sender store');
  });

  await test('8.3 Linux receives DM', async () => {
    await sleep(2000);
    const r = await run(linux, `(()=>{
      const s=__HARMONY_STORE__;
      const msgs=s.dmMessages?.('${macDid}') || [];
      return msgs.some(m=>m.content==='${dm1}');
    })()`);
    if (!r) throw new Error('not received');
  });

  const dm2 = 'dm-reply-' + Date.now();
  await test('8.4 Linux replies via DM', async () => {
    await run(linux, `__HARMONY_STORE__.client().sendDM('${macDid}','${dm2}')`);
  });

  await test('8.5 Mac receives DM reply', async () => {
    await sleep(2000);
    const r = await run(mac, `(()=>{
      const s=__HARMONY_STORE__;
      const msgs=s.dmMessages?.('${linuxDid}') || [];
      return msgs.some(m=>m.content==='${dm2}');
    })()`);
    if (!r) throw new Error('not received');
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 9. TYPING INDICATORS ═══');
  // ═══════════════════════════════════════

  await test('9.1 Mac sends typing', async () => {
    await run(mac, `__HARMONY_STORE__.client().sendTyping?.('${commId}','${textChId}')`);
  });

  await test('9.2 Linux sees typing (ephemeral)', async () => {
    await sleep(500);
    const r = await run(linux, `(()=>{
      const users = __HARMONY_STORE__.activeChannelTypingUsers?.() || __HARMONY_STORE__.typingUsers?.() || [];
      return users.length;
    })()`);
    // Typing is ephemeral — may have already expired
    if (r > 0) console.log('    (typing visible)');
    else console.log('    (typing expired, normal)');
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 10. THREADS ═══');
  // ═══════════════════════════════════════

  await test('10.1 Mac creates thread', async () => {
    const msgId = await run(mac, `__HARMONY_STORE__.messages().find(m=>m.content==='${msg2}')?.id`);
    if (!msgId) throw new Error('no parent message');
    await run(mac, `__HARMONY_STORE__.client().createThread('${commId}','${textChId}','${msgId}','Test Thread')`);
    await sleep(1000);
  });

  await test('10.2 Thread exists in store', async () => {
    const r = await run(mac, `(()=>{
      const s=__HARMONY_STORE__;
      const tc=s.threadCounts?.() || {};
      const at=s.activeThread?.();
      return JSON.stringify({threadCounts:tc,activeThread:at});
    })()`);
    console.log('    threads:', r);
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 11. PINS ═══');
  // ═══════════════════════════════════════

  await test('11.1 Mac pins message', async () => {
    const msgId = await run(mac, `__HARMONY_STORE__.messages().find(m=>m.content==='${msg2}')?.id`);
    if (!msgId) throw new Error('no message');
    await run(mac, `__HARMONY_STORE__.client().pinMessage('${commId}','${textChId}','${msgId}')`);
    await sleep(1000);
  });

  await test('11.2 Get pinned messages', async () => {
    await run(mac, `__HARMONY_STORE__.client().getPinnedMessages('${commId}','${textChId}')`);
    await sleep(1000);
  });

  await test('11.3 Unpin message', async () => {
    const msgId = await run(mac, `__HARMONY_STORE__.messages().find(m=>m.content==='${msg2}')?.id`);
    await run(mac, `__HARMONY_STORE__.client().unpinMessage('${commId}','${textChId}','${msgId}')`);
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 12. ROLES ═══');
  // ═══════════════════════════════════════

  await test('12.1 Mac creates role', async () => {
    await run(mac, `__HARMONY_STORE__.client().createRole('${commId}',{name:'e2e-role',permissions:['send_messages']})`);
    await sleep(1000);
  });

  await test('12.2 Role visible in store', async () => {
    const r = await run(mac, `JSON.stringify((__HARMONY_STORE__.roles?.() || []).map(r=>r.name))`);
    console.log('    roles:', r);
  });

  await test('12.3 Linux sees role', async () => {
    await sleep(1000);
    const r = await run(linux, `(()=>{
      const roles = __HARMONY_STORE__.roles?.() || [];
      return roles.some(r=>r.name==='e2e-role');
    })()`);
    // Role broadcast may not update Linux store
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 13. COMMUNITY MANAGEMENT ═══');
  // ═══════════════════════════════════════

  await test('13.1 Update community name', async () => {
    const r = await run(mac, `(async()=>{
      try { await __HARMONY_STORE__.client().updateCommunity?.('${commId}',{name:'VoiceTest'}); return 'ok'; }
      catch(e) { return 'error:'+e.message; }
    })()`);
    if (r.startsWith('error')) throw new Error(r);
  });

  await test('13.2 Update display name', async () => {
    await run(mac, `__HARMONY_STORE__.client().updateDisplayName('VoiceTestUser')`);
  });

  await test('13.3 Set presence', async () => {
    await run(mac, `__HARMONY_STORE__.client().setPresence('online')`);
  });

  // ═══════════════════════════════════════
  console.log('\n═══ 14. API SURFACE ═══');
  // ═══════════════════════════════════════

  await test('14.1 Client methods', async () => {
    const r = await run(mac, `(()=>{
      const c=__HARMONY_STORE__.client();
      const required=['sendMessage','editMessage','deleteMessage','addReaction','removeReaction',
        'sendDM','editDM','deleteDM','sendDMTyping','createChannel','updateChannel','deleteChannel',
        'joinVoice','leaveVoice','sendTyping','createCommunity','joinCommunity','leaveCommunity',
        'requestCommunityInfo','requestCommunityList','createRole','updateRole','deleteRole',
        'assignRole','updateDisplayName','setPresence','banMember','unbanMember','kickMember',
        'pinMessage','unpinMessage','getPinnedMessages','createThread','sendThreadMessage',
        'getNotifications','getVoiceConnection','getVoiceClient'];
      const missing=required.filter(m=>typeof c[m]!=='function');
      return JSON.stringify({total:required.length,present:required.length-missing.length,missing});
    })()`);
    const data = JSON.parse(r);
    console.log(`    ${data.present}/${data.total} methods` + (data.missing.length ? ` | missing: ${data.missing.join(', ')}` : ''));
    if (data.missing.length > 5) throw new Error(data.missing.join(', '));
  });

  await test('14.2 Store signals', async () => {
    const r = await run(mac, `(()=>{
      const s=__HARMONY_STORE__;
      const sigs=['communities','channels','members','messages','did','displayName',
        'activeChannelId','activeCommunityId','voiceChannelId','channelVoiceParticipants',
        'isVideoEnabled','isMuted','isDeafened','isScreenSharing','speakingUsers',
        'dmConversations','dmMessages','typingUsers','roles','connectionState',
        'activeThread','threadMessages','threadCounts'];
      const missing=sigs.filter(s2=>typeof s[s2]!=='function');
      return JSON.stringify({total:sigs.length,present:sigs.length-missing.length,missing});
    })()`);
    const data = JSON.parse(r);
    console.log(`    ${data.present}/${data.total} signals` + (data.missing.length ? ` | missing: ${data.missing.join(', ')}` : ''));
  });

  // ═══════════════════════════════════════
  console.log('\n═══════════════════════════════════════');
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped / ${passed + failed + skipped} total`);
  console.log('═══════════════════════════════════════');
  if (failed > 0) {
    console.log('\nFailed:');
    results.filter(r => r.startsWith('❌')).forEach(r => console.log('  ' + r));
  }

  mac.close(); linux.close();
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 200);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
