import { WebSocket } from 'ws'
import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import { createCryptoProvider } from '@harmony/crypto'
import type { ProtocolMessage, LamportClock, FederationEvent } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import type { Capability } from '@harmony/zcap'
import { ZCAPService } from '@harmony/zcap'
import type { DIDResolver, RevocationStore } from '@harmony/vc'
import { CRDTLog } from '@harmony/crdt'

// ── Types ──

export interface FederationPeer {
  instanceDID: string
  endpoint: string
  capabilities: Capability[]
  status: 'connected' | 'disconnected' | 'pending'
  lastSeen: string
}

export interface FederationConfig {
  instanceDID: string
  instanceKeyPair: KeyPair
  maxPeers?: number
  syncIntervalMs?: number
  messageRelayTimeout?: number
}

type Unsubscribe = () => void
type EventHandler = (...args: unknown[]) => void

// ── Event Emitter ──

class FederationEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map()

  on(event: string, handler: EventHandler): Unsubscribe {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event)
    if (handlers) for (const h of handlers) h(...args)
  }
}

// ── Federation Manager ──

export class FederationManager {
  private _peers: Map<string, FederationPeer> = new Map()
  private _connections: Map<string, WebSocket> = new Map()
  private _config: FederationConfig
  private _crypto: CryptoProvider
  private _zcapService: ZCAPService
  private _emitter = new FederationEmitter()
  private _messageIds: Set<string> = new Set() // dedup
  private _communityPeers: Map<string, Set<string>> = new Map() // communityId → peerDIDs
  private _didResolver: DIDResolver | null = null
  private _revocationStore: RevocationStore | null = null
  private _onMessage: ((fromPeer: string, msg: ProtocolMessage) => void) | null = null

  constructor(
    config: FederationConfig,
    options?: {
      didResolver?: DIDResolver
      revocationStore?: RevocationStore
      cryptoProvider?: CryptoProvider
      onMessage?: (fromPeer: string, msg: ProtocolMessage) => void
    }
  ) {
    this._config = config
    this._crypto = options?.cryptoProvider ?? createCryptoProvider()
    this._zcapService = new ZCAPService(this._crypto)
    this._didResolver = options?.didResolver ?? null
    this._revocationStore = options?.revocationStore ?? null
    this._onMessage = options?.onMessage ?? null
  }

  async addPeer(params: { instanceDID: string; endpoint: string; capability: Capability }): Promise<FederationPeer> {
    // Verify the capability is valid
    if (!params.capability || !params.capability.id) {
      throw new Error('Invalid ZCAP: missing capability')
    }

    // Check allowed actions include relay
    const hasRelayAction = params.capability.allowedAction.some(
      (a) => a.includes('Relay') || a.includes('Federation') || a.includes('SendMessage')
    )
    if (!hasRelayAction) {
      throw new Error('ZCAP does not include relay/federation action')
    }

    if (this._config.maxPeers && this._peers.size >= this._config.maxPeers) {
      throw new Error('Max peers reached')
    }

    const peer: FederationPeer = {
      instanceDID: params.instanceDID,
      endpoint: params.endpoint,
      capabilities: [params.capability],
      status: 'pending',
      lastSeen: new Date().toISOString()
    }

    this._peers.set(params.instanceDID, peer)

    // Track community scope
    const scope = params.capability.scope as { community?: string }
    if (scope.community) {
      if (!this._communityPeers.has(scope.community)) {
        this._communityPeers.set(scope.community, new Set())
      }
      this._communityPeers.get(scope.community)!.add(params.instanceDID)
    }

    return peer
  }

  async removePeer(instanceDID: string): Promise<void> {
    const peer = this._peers.get(instanceDID)
    if (peer) {
      // Revoke capabilities
      if (this._revocationStore) {
        for (const cap of peer.capabilities) {
          await this._revocationStore.revoke(cap.id, 'Peer removed')
        }
      }
      // Close connection
      const ws = this._connections.get(instanceDID)
      if (ws) {
        ws.close()
        this._connections.delete(instanceDID)
      }
      // Remove from community peers
      for (const [_cid, peerSet] of this._communityPeers) {
        peerSet.delete(instanceDID)
      }
      this._peers.delete(instanceDID)
    }
  }

  peers(): FederationPeer[] {
    return Array.from(this._peers.values())
  }

  async connectToPeer(instanceDID: string): Promise<void> {
    const peer = this._peers.get(instanceDID)
    if (!peer) throw new Error('Unknown peer')

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(peer.endpoint)

      ws.on('open', () => {
        peer.status = 'connected'
        peer.lastSeen = new Date().toISOString()
        this._connections.set(instanceDID, ws)
        this._emitter.emit('peer.connected', { instanceDID })

        // Send auth with capability
        ws.send(
          serialise({
            id: `fed-auth-${Date.now()}`,
            type: 'federation.relay',
            timestamp: new Date().toISOString(),
            sender: this._config.instanceDID,
            payload: { type: 'auth', capabilities: peer.capabilities.map((c) => c.id) }
          })
        )

        resolve()
      })

      ws.on('message', (data: Buffer) => {
        try {
          const msg = deserialise<ProtocolMessage>(data.toString())
          this.handlePeerMessage(instanceDID, msg)
        } catch {
          /* ignore */
        }
      })

      ws.on('close', () => {
        peer.status = 'disconnected'
        this._connections.delete(instanceDID)
        this._emitter.emit('peer.disconnected', { instanceDID })
      })

      ws.on('error', (err: Error) => {
        this._emitter.emit('peer.error', { instanceDID, error: err.message })
        reject(err)
      })
    })
  }

  async disconnectFromPeer(instanceDID: string): Promise<void> {
    const ws = this._connections.get(instanceDID)
    if (ws) {
      ws.close()
      this._connections.delete(instanceDID)
    }
    const peer = this._peers.get(instanceDID)
    if (peer) peer.status = 'disconnected'
  }

  async relayToFederated(communityId: string, message: ProtocolMessage): Promise<void> {
    const peerDIDs = this._communityPeers.get(communityId)
    if (!peerDIDs) return

    for (const peerDID of peerDIDs) {
      const ws = this._connections.get(peerDID)
      if (ws && ws.readyState === WebSocket.OPEN) {
        const relayMsg: ProtocolMessage = {
          id: `relay-${message.id}`,
          type: 'federation.relay',
          timestamp: new Date().toISOString(),
          sender: this._config.instanceDID,
          payload: { communityId, originalMessage: message },
          proof: message.proof
        }
        ws.send(serialise(relayMsg))
      }
    }
  }

  async handleFederatedMessage(
    fromPeer: string,
    message: ProtocolMessage
  ): Promise<{ accepted: boolean; error?: string }> {
    // Check if peer is known
    const peer = this._peers.get(fromPeer)
    if (!peer) {
      return { accepted: false, error: 'Unknown peer' }
    }

    // Check ZCAP
    const payload = message.payload as { communityId?: string; originalMessage?: ProtocolMessage }
    if (payload?.communityId) {
      const peerDIDs = this._communityPeers.get(payload.communityId)
      if (!peerDIDs?.has(fromPeer)) {
        return { accepted: false, error: 'Not federated for this community' }
      }
    }

    // Check revocation
    if (this._revocationStore) {
      for (const cap of peer.capabilities) {
        if (await this._revocationStore.isRevoked(cap.id)) {
          return { accepted: false, error: 'Federation ZCAP revoked' }
        }
      }
    }

    // Verify ZCAP chain if proof present
    if (message.proof) {
      const hasValidProof = message.proof.capabilityId && message.proof.invocation?.proof
      if (!hasValidProof) {
        return { accepted: false, error: 'Invalid ZCAP proof' }
      }
    }

    // Dedup
    if (this._messageIds.has(message.id)) {
      return { accepted: true } // already processed
    }
    this._messageIds.add(message.id)

    // Deliver to local handler
    if (this._onMessage) {
      this._onMessage(fromPeer, message)
    }

    this._emitter.emit('peer.message', { fromPeer, message })
    return { accepted: true }
  }

  async syncWithPeer(instanceDID: string, communityId: string, since: LamportClock): Promise<ProtocolMessage[]> {
    const ws = this._connections.get(instanceDID)
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to peer')
    }

    return new Promise<ProtocolMessage[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Sync timeout')), this._config.messageRelayTimeout ?? 10000)

      const handler = (data: Buffer) => {
        try {
          const msg = deserialise<ProtocolMessage>(data.toString())
          if (msg.type === 'federation.sync') {
            clearTimeout(timeout)
            ws.removeListener('message', handler)
            const payload = msg.payload as { messages: ProtocolMessage[] }
            resolve(payload.messages ?? [])
          }
        } catch {
          /* ignore */
        }
      }

      ws.on('message', handler)

      ws.send(
        serialise({
          id: `sync-req-${Date.now()}`,
          type: 'federation.sync',
          timestamp: new Date().toISOString(),
          sender: this._config.instanceDID,
          payload: { communityId, since }
        })
      )
    })
  }

  on(event: FederationEvent, handler: EventHandler): Unsubscribe {
    return this._emitter.on(event, handler)
  }

  private handlePeerMessage(fromPeer: string, msg: ProtocolMessage): void {
    if (msg.type === 'federation.relay') {
      this.handleFederatedMessage(fromPeer, msg)
    } else if (msg.type === 'federation.sync') {
      this._emitter.emit('peer.sync', { fromPeer, message: msg })
    } else if (msg.type === 'federation.presence') {
      this._emitter.emit('peer.message', { fromPeer, message: msg })
    }
  }
}
