export type {
  VoiceRoom,
  VoiceParticipant,
  RoomOptions,
  JoinOptions,
  VoiceConnection,
  LiveKitAdapter,
  SFUAdapter
} from './room-manager.js'
export { VoiceRoomManager } from './room-manager.js'
export { VoiceClient, BrowserMediaProvider } from './voice-client.js'
export type { VoiceSignaling, VoiceClientOptions, MediaDeviceProvider, JoinRoomOptions } from './voice-client.js'
export { InMemoryAdapter } from './adapters/in-memory.js'
export { E2EEBridge } from './e2ee-bridge.js'
export { createEncryptTransform, createDecryptTransform } from './insertable-streams.js'

// Backward compat alias
export { InMemoryAdapter as InMemoryLiveKitAdapter } from './adapters/in-memory.js'

// Re-export adapter types
export type { SFUAdapter as SFUAdapterInterface } from './adapters/types.js'

// Client-side SFU adapters
export type { ClientSFUAdapter, SignalingFn, TrackObject, PushTracksResult, PullTracksResult } from './sfu-adapter.js'
export { CloudflareSFUAdapter } from './cf-sfu-adapter.js'
export { P2PMeshManager } from './p2p-mesh.js'
export type { P2PMeshConfig } from './p2p-mesh.js'
