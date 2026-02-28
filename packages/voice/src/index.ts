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
export type { VoiceSignaling, VoiceClientOptions, MediaDeviceProvider } from './voice-client.js'
export type { MediaDeviceProvider } from './voice-client.js'
export { InMemoryAdapter } from './adapters/in-memory.js'
export { E2EEBridge } from './e2ee-bridge.js'
export { createEncryptTransform, createDecryptTransform } from './insertable-streams.js'

// Backward compat alias
export { InMemoryAdapter as InMemoryLiveKitAdapter } from './adapters/in-memory.js'

// Re-export adapter types
export type { SFUAdapter as SFUAdapterInterface } from './adapters/types.js'
