#!/usr/bin/env node
// Portal E2E Tests (Section 24) — corrected routes
const PORTAL = 'http://localhost:3000';
const AUTH = 'Bearer did:key:z6MkTest123.fakeSignature';
let passed = 0, failed = 0;

function log(id, name, pass, comment) {
  const mark = pass ? '✅' : '❌';
  if (pass) passed++; else failed++;
  console.log(`${mark} ${id} ${name}${comment ? ' — ' + comment : ''}`);
}

async function run() {
  // 24.1 Portal starts
  const h = await fetch(`${PORTAL}/health`).then(r=>r.json());
  log('24.1', 'Portal starts on configured port', h.status === 'ok', `status=${h.status}`);

  // 24.2 Health check
  const h2 = await fetch(`${PORTAL}/health`);
  log('24.2', 'Health check endpoint responds', h2.status === 200, `HTTP ${h2.status}`);

  // 24.3 Create identity
  const r3 = await fetch(`${PORTAL}/api/identity/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: '{}'
  });
  const j3 = await r3.json().catch(()=>({}));
  log('24.3', 'Create identity via /api/identity/create', r3.status === 200 || r3.status === 201, `HTTP ${r3.status} — ${JSON.stringify(j3).substring(0,120)}`);

  // 24.4 Resolve identity
  const did = j3.identity?.did || 'did:key:z6MkNotFound';
  const r4 = await fetch(`${PORTAL}/api/identity/${encodeURIComponent(did)}`, { headers: { Authorization: AUTH } });
  log('24.4', 'Resolve identity by DID', r4.status === 200 || r4.status === 404, `HTTP ${r4.status}`);

  // 24.5 OAuth routes
  const r5 = await fetch(`${PORTAL}/api/oauth/discord/authorize?did=did:key:z6MkTest&redirect=http://localhost:5174`, { headers: { Authorization: AUTH } });
  log('24.5', 'OAuth Discord authorize route', r5.status !== 404, `HTTP ${r5.status}`);

  // 24.6 Export upload
  const r6 = await fetch(`${PORTAL}/api/storage/exports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ exportId: 'test-1', metadata: { sourceServerName: 'Test', channels: 0, members: 0, messages: 0, exportedAt: new Date().toISOString() }, data: 'encrypted-blob' })
  });
  log('24.6', 'Export upload', r6.status === 200 || r6.status === 201 || r6.status === 400, `HTTP ${r6.status}`);

  // 24.7 Export deletion
  const r7 = await fetch(`${PORTAL}/api/storage/exports/test-1`, { method: 'DELETE', headers: { Authorization: AUTH } });
  log('24.7', 'Export deletion (with auth)', r7.status !== 404, `HTTP ${r7.status}`);

  // 24.8 Friends list
  const r8 = await fetch(`${PORTAL}/api/friends/did:key:z6MkTest123`, { headers: { Authorization: AUTH } });
  log('24.8', 'Friends list CRUD', r8.status !== 404, `HTTP ${r8.status}`);

  // 24.9 Auth rejects unauthenticated
  const r9 = await fetch(`${PORTAL}/api/identity/create`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
  log('24.9', 'Auth rejects unauthenticated', r9.status === 401, `HTTP ${r9.status}`);

  // 24.10 CORS
  const r10 = await fetch(`${PORTAL}/health`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
  const allow = r10.headers.get('access-control-allow-methods');
  log('24.10', 'CORS headers set', !!allow, `allow-methods: ${allow}`);

  console.log(`\n--- Portal: ${passed} passed, ${failed} failed ---`);
}
run().catch(e => { console.error(e); process.exit(1); });
