# Mobile Build Guide

Build and install Harmony on iOS and Android devices.

## Prerequisites

### All Platforms

```bash
# Build the web app first — Capacitor wraps the built output
pnpm build

# Install Capacitor CLI (already in devDependencies)
pnpm install
```

### Android

1. **Android Studio** — [Download](https://developer.android.com/studio)
   ```bash
   brew install --cask android-studio
   ```
2. **Android SDK** — Open Android Studio → Settings → SDK Manager → Install:
   - Android SDK Platform 34 (Android 14)
   - Android SDK Build-Tools 34
   - Android SDK Command-line Tools
3. **Java 17+** — Required by Gradle
   ```bash
   brew install openjdk@17
   ```
4. **Environment variables** — Add to `~/.zshrc`:
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
   ```

### iOS

1. **Xcode 15+** — Install from Mac App Store
2. **CocoaPods**
   ```bash
   brew install cocoapods
   ```
3. **Apple Developer account** — Free for device testing, paid ($99/year) for distribution

---

## First-Time Setup

```bash
# Add native platforms (only needed once)
pnpm cap:add:android    # Creates android/ directory
pnpm cap:add:ios        # Creates ios/ directory
```

---

## Android

### Build & Install (Debug APK)

```bash
# 1. Build the web app
pnpm build

# 2. Sync web assets to Android project
pnpm cap:sync

# 3. Build debug APK
cd android
./gradlew assembleDebug
cd ..

# APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

### Install on Device

**Via USB:**

```bash
# Enable USB Debugging on your phone:
#   Settings → About Phone → tap "Build number" 7 times → back to Settings →
#   Developer options → enable "USB debugging"

# Connect phone via USB, then:
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Via wireless (Android 11+):**

```bash
# On phone: Developer options → Wireless debugging → enable → Pair device with pairing code
adb pair <ip>:<port>    # Enter the pairing code
adb connect <ip>:<port> # Connect to the device
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Via file transfer:**

- Copy `app-debug.apk` to your phone (email, cloud drive, USB transfer)
- Open it on the phone → Install (you may need to allow "Install from unknown sources")

### Build Release APK (Signed)

```bash
# Generate a signing key (once)
keytool -genkey -v -keystore harmony-release.keystore \
  -alias harmony -keyalg RSA -keysize 2048 -validity 10000

# Build release
cd android
./gradlew assembleRelease
cd ..

# APK: android/app/build/outputs/apk/release/app-release.apk
```

### Open in Android Studio

```bash
pnpm cap:open:android
```

Then use Run → Run 'app' to build and install directly to a connected device.

---

## iOS

### Build & Install (Development)

```bash
# 1. Build the web app
pnpm build

# 2. Sync web assets to iOS project
pnpm cap:sync

# 3. Open in Xcode
pnpm cap:open:ios
```

In Xcode:

1. Select your team in Signing & Capabilities (any Apple ID works for development)
2. Select your connected iPhone as the build target
3. Click Run (⌘R)
4. First time: trust the developer certificate on your phone: Settings → General → VPN & Device Management → trust your developer account

### Build IPA (Distribution)

In Xcode:

1. Product → Archive
2. Distribute App → choose distribution method
3. For TestFlight: upload to App Store Connect
4. For Ad Hoc: export IPA, install via Apple Configurator or `ios-deploy`

---

## Live Reload (Development)

For rapid development with hot-reload on device:

```bash
# Start the Vite dev server
cd packages/ui-app && pnpm dev
# Note the local IP (e.g., http://192.168.1.100:5173)
```

Update `capacitor.config.ts` temporarily:

```ts
const config: CapacitorConfig = {
  // ...existing config...
  server: {
    url: 'http://192.168.1.100:5173', // Your dev machine IP
    cleartext: true // Allow HTTP on Android
  }
}
```

Then `pnpm cap:sync` and run on device. Changes appear instantly.

**⚠️ Remove the `server.url` override before building for production.**

---

## Troubleshooting

**"INSTALL_FAILED_UPDATE_INCOMPATIBLE"** — Uninstall the existing app first:

```bash
adb uninstall chat.harmony.app
```

**Gradle build fails with Java version error** — Ensure Java 17+:

```bash
java --version  # Should be 17+
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

**iOS "Untrusted Developer"** — On the phone: Settings → General → VPN & Device Management → trust your developer certificate.

**Capacitor plugin not found** — Install required plugins:

```bash
pnpm add @capacitor/push-notifications @capacitor/haptics @capacitor/status-bar @capacitor/app
pnpm cap:sync
```

**Web app changes not appearing** — Always rebuild before syncing:

```bash
pnpm build && pnpm cap:sync
```
