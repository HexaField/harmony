# FEATURES.md — Voice, Video & Screen Share Production Readiness

_Comprehensive audit and implementation checklist. Updated 2026-02-28._

---

## Current State Summary

The **server-side** MediasoupAdapter is complete (room/transport/produce/consume/token). The **client-side** mediasoup-client integration is **not implemented** — `VoiceConnectionImpl` acquires `getUserMedia` streams but never creates RTCPeerConnection, Device, Transport, or Producer/Consumer. UI components exist as **dead stubs** (VideoGrid, VoiceChannelPanel, ScreenShareView) — not wired in.

---

## Voice — Audio

| #   | Feature                               | Status | Notes                                                        |
| --- | ------------------------------------- | ------ | ------------------------------------------------------------ |
| V1  | mediasoup-client Device integration   | ⬜     | Load router RTP capabilities, create Device                  |
| V2  | Send transport (client→SFU)           | ⬜     | Create send Transport from token params, DTLS connect        |
| V3  | Recv transport (SFU→client)           | ⬜     | Create recv Transport, signal server for consumers           |
| V4  | Audio Producer (mic capture → SFU)    | ⬜     | `getUserMedia({audio})` → `transport.produce()`              |
| V5  | Audio Consumer (SFU → speaker)        | ⬜     | Subscribe to remote audio producers, play via `<audio>`      |
| V6  | Mute/unmute (pause/resume producer)   | 📋     | UI toggle exists, not wired to producer.pause/resume         |
| V7  | Deafen (pause all consumers locally)  | 📋     | UI toggle exists, not wired                                  |
| V8  | Speaking indicators (audio level)     | 📋     | Signal exists, no AudioWorklet/analyser                      |
| V9  | Voice activity detection (VAD)        | ⬜     | AudioWorklet or AnalyserNode for push-to-talk alt            |
| V10 | Echo cancellation / noise suppression | ⬜     | getUserMedia constraints: echoCancellation, noiseSuppression |
| V11 | Automatic gain control                | ⬜     | getUserMedia constraint: autoGainControl                     |
| V12 | Audio device selection (input)        | ⬜     | `enumerateDevices()` → UI picker → restart producer          |
| V13 | Audio device selection (output)       | ⬜     | `setSinkId()` on `<audio>` elements                          |
| V14 | Volume control (per-user)             | ⬜     | GainNode per consumer stream                                 |
| V15 | Reconnect on transport failure        | ⬜     | ICE restart, transport reconnect signaling                   |

## Video — Camera

| #   | Feature                               | Status | Notes                                              |
| --- | ------------------------------------- | ------ | -------------------------------------------------- |
| C1  | Video Producer (camera → SFU)         | ⬜     | `getUserMedia({video})` → `transport.produce()`    |
| C2  | Video Consumer (SFU → display)        | ⬜     | Subscribe, attach to `<video>` element             |
| C3  | VideoGrid component (adaptive layout) | 📋     | Component exists, not wired to real streams        |
| C4  | Local video preview (self-view)       | ⬜     | `<video>` with local stream, mirrored              |
| C5  | Camera on/off toggle                  | 📋     | UI exists, now calls enableVideo() but no producer |
| C6  | Camera device selection               | ⬜     | `enumerateDevices()` → picker                      |
| C7  | Simulcast (VP8 layers)                | ⬜     | encodings array on produce(), SFU layer selection  |
| C8  | Bandwidth adaptation                  | ⬜     | SFU selects simulcast layer per subscriber         |
| C9  | Picture-in-Picture (PiP)              | 📋     | Stub exists                                        |
| C10 | Spotlight / pin participant           | ⬜     | UI for pinning one video large                     |
| C11 | Video resolution constraints          | ⬜     | width/height/frameRate constraints                 |

## Screen Share

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| S1 | Screen share Producer | ⬜ | `getDisplayMedia()` → separate producer |
| S2 | Screen share Consumer + view | 📋 | ScreenShareView stub exists |
| S3 | Screen share with audio | ⬜ | `getDisplayMedia({audio: true})` on supported platforms |
| S4 | Electron desktopCapturer integration | ⬜ | `desktopCapturer.getSources()` for Electron window/screen picker |
| S5 | Screen share indicator in UI | ⬜ | Show who is sharing, stop button |
| S6 | Screen share replaces video grid | ⬜ | Layout switch: screen share main + thumbnails |

## Electron Media Permissions

| #   | Feature                               | Status | Notes                                                     |
| --- | ------------------------------------- | ------ | --------------------------------------------------------- |
| E1  | Permission request handler            | ✅     | `setPermissionRequestHandler` added                       |
| E2  | macOS camera TCC entitlement          | ⬜     | `com.apple.security.device.camera` in entitlements.plist  |
| E3  | macOS microphone TCC entitlement      | ⬜     | `com.apple.security.device.audio-input`                   |
| E4  | macOS screen recording TCC            | ⬜     | `com.apple.security.cs.allow-screen-recording` (Electron) |
| E5  | `systemPreferences.askForMediaAccess` | ⬜     | Electron API to trigger macOS permission dialog           |
| E6  | Permission status UI indicator        | ⬜     | Show when camera/mic blocked                              |

## Voice UI Components

| #   | Feature                              | Status | Notes                                               |
| --- | ------------------------------------ | ------ | --------------------------------------------------- |
| U1  | VoiceControlBar — mute wired         | 📋     | Toggle exists, needs producer integration           |
| U2  | VoiceControlBar — deafen wired       | 📋     | Toggle exists, needs consumer integration           |
| U3  | VoiceControlBar — camera wired       | 📋     | Calls enableVideo, needs producer                   |
| U4  | VoiceControlBar — screen share wired | 📋     | Calls startScreenShare, needs producer              |
| U5  | VoiceControlBar — disconnect wired   | 🔧     | Calls leaveVoice, needs transport cleanup           |
| U6  | VideoGrid — render real streams      | ⬜     | Attach MediaStream to `<video>` refs                |
| U7  | ScreenShareView — render real stream | ⬜     | Large view + presenter info                         |
| U8  | VoiceChannelPanel — participant list | 📋     | Shows avatars, needs real participant data          |
| U9  | VoiceManager integration             | ⬜     | `voice.ts` VoiceManager not used anywhere           |
| U10 | Voice settings panel                 | ⬜     | Device selection, volume, noise suppression toggles |
| U11 | Voice connection quality indicator   | ⬜     | ICE connection state → UI                           |
| U12 | Participant audio indicators         | ⬜     | Green ring when speaking (from AudioWorklet)        |

## Voice Signaling (WebSocket)

| #   | Feature                            | Status | Notes                                         |
| --- | ---------------------------------- | ------ | --------------------------------------------- |
| W1  | voice.token request/response       | ✅     | Client sends, server generates JWT            |
| W2  | voice.transport.connect            | ✅     | Server handler exists                         |
| W3  | voice.produce signaling            | ✅     | Server handler exists                         |
| W4  | voice.consume signaling            | ✅     | Server handler exists                         |
| W5  | voice.consumer.resume              | ✅     | Server handler exists                         |
| W6  | Client-side signaling dispatch     | ⬜     | Client must send these messages at right time |
| W7  | voice.join / voice.leave broadcast | ✅     | Server broadcasts to channel participants     |
| W8  | Participant state sync on join     | ⬜     | New joiner gets existing producers list       |

## E2EE for Voice/Video

| #   | Feature                            | Status | Notes                                                |
| --- | ---------------------------------- | ------ | ---------------------------------------------------- |
| X1  | E2EE bridge key injection          | ✅     | E2EEBridge interface + HKDF                          |
| X2  | Insertable Streams transform       | ⬜     | RTCRtpSender/Receiver transform for frame encryption |
| X3  | E2EE key rotation on member change | ⬜     | Re-key when participant joins/leaves                 |

## Testing

| #   | Feature                                     | Status | Notes                           |
| --- | ------------------------------------------- | ------ | ------------------------------- |
| T1  | Unit tests for mediasoup-client integration | ⬜     | Mock Device/Transport           |
| T2  | Cross-device voice E2E (real audio)         | ⬜     | Mac ↔ Linux with mediasoup      |
| T3  | Cross-device video E2E                      | ⬜     | Camera stream visible on remote |
| T4  | Screen share E2E                            | ⬜     |                                 |
| T5  | Voice reconnection test                     | ⬜     | Kill transport, verify recovery |

---

## Implementation Priority (Critical Path)

### Phase 1 — Audio works end-to-end

V1 → V2 → V3 → V4 → V5 → W6 → V6 → E2/E3/E5 → V10/V11

### Phase 2 — Video works end-to-end

C1 → C2 → U6 → C4 → C5 → C6 → E2/E5

### Phase 3 — Screen share

S1 → S2 → S4 → S5 → S6

### Phase 4 — Polish

V8 → V12 → V13 → V14 → C7 → C10 → U10 → U11 → V15

### Phase 5 — E2EE voice

X2 → X3

---

## Architecture Notes

**Client flow (mediasoup-client):**

1. Client receives JWT token from server via `voice.token` response
2. Decode JWT → get `routerRtpCapabilities`, `transportId`, `dtlsParameters`, `iceCandidates`, `iceParameters`
3. Create `mediasoup-client.Device`, load router capabilities
4. Create send Transport (`device.createSendTransport()`) with server's params
5. On `transport.on('connect')` → send `voice.transport.connect` to server
6. On `transport.on('produce')` → send `voice.produce` to server, get producerId back
7. `getUserMedia()` → `sendTransport.produce({ track })` for audio/video
8. Create recv Transport similarly for consuming
9. For each remote participant's producer → send `voice.consume` → get consumer params → `recvTransport.consume()` → attach stream to `<video>`/`<audio>`

**Key dependency:** `mediasoup-client` npm package (browser-side). Currently NOT in package.json.
