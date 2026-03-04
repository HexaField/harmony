#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE22="$HOME/.nvm/versions/node/v22.18.0/bin"
ESBUILD="$ROOT/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js"
ELECTRON_VER=$(cat packages/app/node_modules/electron/dist/version 2>/dev/null || echo "36.9.5")

echo "=== Harmony Electron Build ==="
echo "Node 22: $NODE22"
echo "Electron: $ELECTRON_VER"

# 1. Rebuild better-sqlite3 for Electron ABI
echo "→ Rebuilding better-sqlite3 for Electron $ELECTRON_VER..."
cd "$ROOT/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3"
npm_config_runtime=electron \
npm_config_target=$ELECTRON_VER \
npm_config_disturl=https://electronjs.org/headers \
npm_config_build_from_source=true \
PATH="$NODE22:$PATH" npm rebuild --silent 2>&1
echo "  ✓ better-sqlite3 rebuilt"

# 2. Build UI
echo "→ Building UI..."
cd "$ROOT/packages/ui-app"
PATH="$NODE22:$PATH" npx vite build --mode production 2>&1 | tail -2
echo "  ✓ UI built"

# 3. Bundle Electron main process
echo "→ Bundling Electron main..."
cd "$ROOT"
PATH="$NODE22:$PATH" node -e "
const esbuild = require('$ESBUILD');
esbuild.buildSync({
  entryPoints: ['packages/app/bin/harmony-app.js'],
  bundle: true, platform: 'node', format: 'esm',
  outfile: 'packages/app/dist/main.mjs',
  external: ['electron', 'better-sqlite3', 'cpu-features'],
  banner: { js: 'import { fileURLToPath as __fUTP } from \"url\"; import { dirname as __dn } from \"path\"; const __filename = __fUTP(import.meta.url); const __dirname = __dn(__filename);' },
});
"
echo "  ✓ main.mjs bundled"

# 4. Package with electron-builder (npmRebuild: false to keep our Electron-ABI binary)
echo "→ Packaging..."
cd "$ROOT/packages/app"
PATH="$NODE22:$PATH" npx electron-builder --mac --arm64 --dir 2>&1 | grep -E "signing|notariz|error|warn" || true
echo "  ✓ Packaged"

# 5. Install
echo "→ Installing to /Applications..."
pkill -9 -f "Harmony" 2>/dev/null || true
sleep 1
rm -rf /Applications/Harmony.app
cp -R dist-electron/mac-arm64/Harmony.app /Applications/Harmony.app
echo "  ✓ Installed"

# 6. Verify
echo ""
echo "=== Verification ==="
PATH="$NODE22:$PATH" node -e "
try { 
  process.dlopen({exports:{}}, '/Applications/Harmony.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node')
  console.log('  ✗ better-sqlite3 ABI: Node (WRONG)')
} catch(e) { 
  if (e.message.includes('NODE_MODULE_VERSION 135')) console.log('  ✓ better-sqlite3 ABI: Electron 36 (correct)')
  else console.log('  ? better-sqlite3:', e.message.substring(0,100))
}"

ls /Applications/Harmony.app/Contents/Resources/ui/index.html >/dev/null && echo "  ✓ UI assets present" || echo "  ✗ UI assets missing"

echo ""
echo "Done! Launch with:"
echo "  /Applications/Harmony.app/Contents/MacOS/Harmony --remote-debugging-port=9222"

# 7. Restore better-sqlite3 for Node 22 (so standalone server still works)
echo "→ Restoring better-sqlite3 for Node 22..."
cd "$ROOT/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3"
PATH="$NODE22:$PATH" npm rebuild --silent 2>&1
echo "  ✓ better-sqlite3 restored for Node 22"
