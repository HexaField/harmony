// Migration E2E test via CDP
const { join } = require('path');
const ROOT = join(__dirname, '..', '..');
const WebSocket = require(join(ROOT, 'node_modules/.pnpm/ws@8.19.0/node_modules/ws'));
const BOT_TOKEN = process.argv[2] || '';
const GUILD_ID = process.argv[3] || '';
const SERVER_URL = process.argv[4] || 'ws://127.0.0.1:3100';

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('Usage: node test-migration-cdp.cjs <bot-token> <guild-id> [server-url]');
  process.exit(1);
}

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  if (!tabs.length) { console.error('No CDP tabs'); process.exit(1); }
  
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise(r => ws.on('open', r));
  
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = id++;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { pending.delete(i); reject(new Error(`timeout: ${method}`)); }, 30000);
  });
  
  const eval_ = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      const desc = r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text;
      throw new Error(`Eval error: ${desc}`);
    }
    return r.result?.result?.value;
  };
  
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  const clickButton = async (text) => {
    const result = await eval_(`
      (() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const btn = btns.find(b => b.textContent.includes('${text}'));
        if (btn) { btn.click(); return 'clicked: ${text}'; }
        return 'not found: ${text} — available: ' + btns.map(b => b.textContent.trim().substring(0,40)).join(' | ');
      })()
    `);
    console.log(' ', result);
    return result?.startsWith('clicked');
  };
  
  const fillInput = async (placeholder, value) => {
    await eval_(`
      (() => {
        const inputs = [...document.querySelectorAll('input, textarea')];
        const input = inputs.find(i => i.placeholder?.includes('${placeholder}')) || inputs.find(i => i.labels?.[0]?.textContent?.includes('${placeholder}'));
        if (!input) return 'no input for: ${placeholder}';
        const nativeSet = Object.getOwnPropertyDescriptor(
          input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'
        ).set;
        nativeSet.call(input, '${value}');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'filled: ${placeholder}';
      })()
    `);
  };
  
  const getBodyText = async () => eval_('document.body?.innerText?.substring(0,1500)');
  
  // Connect to server if needed
  console.log('1. Ensuring server connection...');
  await eval_(`
    (async () => {
      const store = window.__HARMONY_STORE__;
      const servers = store.servers?.() || [];
      if (!servers.some(s => s.url === '${SERVER_URL}')) {
        await store.addServer('${SERVER_URL}');
      }
      return 'connected';
    })()
  `);
  await sleep(2000);
  
  // Click "Migrate from Discord"
  console.log('2. Opening migration wizard...');
  await clickButton('Migrate from Discord');
  await sleep(500);
  
  // Should be on hosting step — click "Existing server"
  console.log('3. Selecting existing server...');
  await clickButton('Existing server');
  await sleep(500);
  
  // Fill server URL and click connect/go
  console.log('4. Filling server URL...');
  // Find and fill the server URL input
  await eval_(`
    (() => {
      const inputs = [...document.querySelectorAll('input')];
      for (const input of inputs) {
        if (input.closest('[style*="display: none"]')) continue;
        const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, '${SERVER_URL}');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'filled input';
      }
      return 'no visible input';
    })()
  `);
  await sleep(300);
  
  // Click "Go to your community" or next step button
  console.log('5. Proceeding to bot setup...');
  let clicked = await clickButton('Go to your community');
  if (!clicked) clicked = await clickButton('Next');
  if (!clicked) clicked = await clickButton('Continue');
  await sleep(2000);
  
  let body = await getBodyText();
  console.log('Current view:', body?.substring(0, 300));
  console.log('---');
  
  // Check if we're on bot-setup step
  if (body?.includes('Bot Token') || body?.includes('bot token') || body?.includes('Discord Bot')) {
    console.log('6. On bot setup — filling token and guild...');
    
    // Fill bot token
    await eval_(`
      (() => {
        const inputs = [...document.querySelectorAll('input')];
        // First visible input = bot token
        const tokenInput = inputs[0];
        if (tokenInput) {
          const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          nativeSet.call(tokenInput, '${BOT_TOKEN}');
          tokenInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // Second input = guild ID
        const guildInput = inputs[1];
        if (guildInput) {
          const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          nativeSet.call(guildInput, '${GUILD_ID}');
          guildInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return 'filled ' + inputs.length + ' inputs';
      })()
    `);
    await sleep(300);
    
    // Click start/begin/export button
    console.log('7. Starting export...');
    clicked = await clickButton('Start');
    if (!clicked) clicked = await clickButton('Begin');
    if (!clicked) clicked = await clickButton('Export');
    if (!clicked) clicked = await clickButton('Run');
    await sleep(3000);
    
    body = await getBodyText();
    console.log('After start:', body?.substring(0, 500));
  } else {
    console.log('Not on bot setup, current body:', body?.substring(0, 500));
  }
  
  // Poll for progress
  console.log('8. Polling for progress...');
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    body = await getBodyText();
    const progress = body?.match(/(\d+)%/) || body?.match(/Phase (\d)/);
    if (progress) console.log(`  Progress: ${progress[0]}`);
    if (body?.includes('complete') || body?.includes('Complete') || body?.includes('Success')) {
      console.log('✅ Migration complete!');
      console.log(body?.substring(0, 500));
      break;
    }
    if (body?.includes('error') || body?.includes('Error') || body?.includes('failed')) {
      console.log('❌ Migration error:');
      console.log(body?.substring(0, 500));
      break;
    }
    if (i === 29) {
      console.log('⏰ Timeout — final state:');
      console.log(body?.substring(0, 500));
    }
  }
  
  ws.close();
}
main().catch(e => { console.error(e); process.exit(1); });
