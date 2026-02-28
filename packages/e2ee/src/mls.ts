import { ed25519 } from '@noble/curves/ed25519'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { KeyPair } from '@harmony/crypto'
import type {
  MLSGroup,
  MLSCiphertext,
  Welcome,
  Commit,
  Proposal,
  KeyPackage,
  GroupMember,
  LeafNode,
  MLSProvider
} from './keypackage.js'

// ── Simplified MLS internal state ──

interface GroupState {
  groupId: string
  epoch: number
  myLeafIndex: number
  members: MemberState[]
  epochSecret: Uint8Array
  mySigningKey: Uint8Array
  myEncryptionKey: Uint8Array
  mySigningPublicKey: Uint8Array
  myEncryptionPublicKey: Uint8Array
}

interface MemberState {
  leafIndex: number
  did: string
  encryptionKey: Uint8Array
  signatureKey: Uint8Array
}

function deriveEpochKey(epochSecret: Uint8Array, epoch: number, purpose: string): Uint8Array {
  const info = new TextEncoder().encode(`harmony-mls-${purpose}-${epoch}`)
  return hkdf(sha256, epochSecret, undefined, info, 32)
}

function advanceEpochSecret(currentSecret: Uint8Array, commitSecret: Uint8Array): Uint8Array {
  const info = new TextEncoder().encode('harmony-mls-epoch-advance')
  const combined = new Uint8Array(currentSecret.length + commitSecret.length)
  combined.set(currentSecret)
  combined.set(commitSecret, currentSecret.length)
  return hkdf(sha256, combined, undefined, info, 32)
}

function serializeGroupState(state: GroupState): Uint8Array {
  const json = JSON.stringify({
    groupId: state.groupId,
    epoch: state.epoch,
    myLeafIndex: state.myLeafIndex,
    members: state.members.map((m) => ({
      leafIndex: m.leafIndex,
      did: m.did,
      encryptionKey: Array.from(m.encryptionKey),
      signatureKey: Array.from(m.signatureKey)
    })),
    epochSecret: Array.from(state.epochSecret),
    mySigningKey: Array.from(state.mySigningKey),
    myEncryptionKey: Array.from(state.myEncryptionKey),
    mySigningPublicKey: Array.from(state.mySigningPublicKey),
    myEncryptionPublicKey: Array.from(state.myEncryptionPublicKey)
  })
  return new TextEncoder().encode(json)
}

function deserializeGroupState(data: Uint8Array): GroupState {
  const json = JSON.parse(new TextDecoder().decode(data))
  return {
    groupId: json.groupId,
    epoch: json.epoch,
    myLeafIndex: json.myLeafIndex,
    members: json.members.map(
      (m: { leafIndex: number; did: string; encryptionKey: number[]; signatureKey: number[] }) => ({
        leafIndex: m.leafIndex,
        did: m.did,
        encryptionKey: new Uint8Array(m.encryptionKey),
        signatureKey: new Uint8Array(m.signatureKey)
      })
    ),
    epochSecret: new Uint8Array(json.epochSecret),
    mySigningKey: new Uint8Array(json.mySigningKey),
    myEncryptionKey: new Uint8Array(json.myEncryptionKey),
    mySigningPublicKey: new Uint8Array(json.mySigningPublicKey),
    myEncryptionPublicKey: new Uint8Array(json.myEncryptionPublicKey)
  }
}

// ── SimplifiedMLSGroup ──

class SimplifiedMLSGroup implements MLSGroup {
  private state: GroupState

  constructor(state: GroupState) {
    this.state = state
  }

  get groupId(): string {
    return this.state.groupId
  }
  get epoch(): number {
    return this.state.epoch
  }
  get myLeafIndex(): number {
    return this.state.myLeafIndex
  }

  async encrypt(plaintext: Uint8Array): Promise<MLSCiphertext> {
    const epochKey = deriveEpochKey(this.state.epochSecret, this.state.epoch, 'message')
    const nonce = randomBytes(24)
    // Prepend nonce to ciphertext for decryption
    const cipher = xchacha20poly1305(epochKey, nonce)
    const encrypted = cipher.encrypt(plaintext)
    const combined = new Uint8Array(24 + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, 24)
    return {
      epoch: this.state.epoch,
      senderIndex: this.state.myLeafIndex,
      ciphertext: combined,
      contentType: 'application'
    }
  }

  async decrypt(ciphertext: MLSCiphertext): Promise<{ plaintext: Uint8Array; senderIndex: number }> {
    if (ciphertext.epoch !== this.state.epoch) {
      throw new Error(`Epoch mismatch: expected ${this.state.epoch}, got ${ciphertext.epoch}`)
    }
    // Verify sender is a member
    const sender = this.state.members.find((m) => m.leafIndex === ciphertext.senderIndex)
    if (!sender) {
      throw new Error(`Unknown sender index: ${ciphertext.senderIndex}`)
    }
    const epochKey = deriveEpochKey(this.state.epochSecret, this.state.epoch, 'message')
    const nonce = ciphertext.ciphertext.slice(0, 24)
    const encrypted = ciphertext.ciphertext.slice(24)
    const cipher = xchacha20poly1305(epochKey, nonce)
    const plaintext = cipher.decrypt(encrypted)
    return { plaintext, senderIndex: ciphertext.senderIndex }
  }

  async addMember(memberKeyPackage: KeyPackage): Promise<{ welcome: Welcome; commit: Commit }> {
    const newLeafIndex = this.state.members.length
    const newMember: MemberState = {
      leafIndex: newLeafIndex,
      did: memberKeyPackage.leafNode.did,
      encryptionKey: memberKeyPackage.leafNode.encryptionKey,
      signatureKey: memberKeyPackage.leafNode.signatureKey
    }

    const commitSecret = randomBytes(32)
    const newEpochSecret = advanceEpochSecret(this.state.epochSecret, commitSecret)

    // Create welcome with encrypted group state for the new member
    const futureState: GroupState = {
      ...this.state,
      epoch: this.state.epoch + 1,
      members: [...this.state.members, newMember],
      epochSecret: newEpochSecret,
      myLeafIndex: newLeafIndex,
      mySigningKey: new Uint8Array(0), // placeholder — joiner fills in own keys
      myEncryptionKey: new Uint8Array(0),
      mySigningPublicKey: memberKeyPackage.leafNode.signatureKey,
      myEncryptionPublicKey: memberKeyPackage.leafNode.encryptionKey
    }
    const stateBytes = serializeGroupState(futureState)

    // Encrypt the group state with HKDF of initKey
    const welcomeKey = hkdf(
      sha256,
      memberKeyPackage.initKey,
      undefined,
      new TextEncoder().encode('harmony-mls-welcome'),
      32
    )
    const welcomeNonce = randomBytes(24)
    const welcomeCipher = xchacha20poly1305(welcomeKey, welcomeNonce)
    const encryptedState = welcomeCipher.encrypt(stateBytes)
    const welcomePayload = new Uint8Array(24 + encryptedState.length)
    welcomePayload.set(welcomeNonce)
    welcomePayload.set(encryptedState, 24)

    const welcome: Welcome = {
      groupId: this.state.groupId,
      epoch: this.state.epoch + 1,
      encryptedGroupState: welcomePayload
    }

    const proposal: Proposal = { type: 'add', keyPackage: memberKeyPackage }
    const commitData = new TextEncoder().encode(
      JSON.stringify({
        groupId: this.state.groupId,
        epoch: this.state.epoch + 1,
        proposals: [{ type: 'add', did: memberKeyPackage.leafNode.did }]
      })
    )
    const signature = ed25519.sign(commitData, this.state.mySigningKey)

    const commit: Commit = {
      groupId: this.state.groupId,
      epoch: this.state.epoch + 1,
      proposals: [proposal],
      commitSecret,
      signature
    }

    // Apply locally
    this.state.members.push(newMember)
    this.state.epoch += 1
    this.state.epochSecret = newEpochSecret

    return { welcome, commit }
  }

  async removeMember(leafIndex: number): Promise<Commit> {
    const memberIdx = this.state.members.findIndex((m) => m.leafIndex === leafIndex)
    if (memberIdx < 0) throw new Error(`Member not found at index ${leafIndex}`)

    const commitSecret = randomBytes(32)
    const newEpochSecret = advanceEpochSecret(this.state.epochSecret, commitSecret)

    const proposal: Proposal = { type: 'remove', leafIndex }
    const commitData = new TextEncoder().encode(
      JSON.stringify({
        groupId: this.state.groupId,
        epoch: this.state.epoch + 1,
        proposals: [{ type: 'remove', leafIndex }]
      })
    )
    const signature = ed25519.sign(commitData, this.state.mySigningKey)

    const commit: Commit = {
      groupId: this.state.groupId,
      epoch: this.state.epoch + 1,
      proposals: [proposal],
      commitSecret,
      signature
    }

    // Apply locally
    this.state.members.splice(memberIdx, 1)
    this.state.epoch += 1
    this.state.epochSecret = newEpochSecret

    return commit
  }

  async processCommit(commit: Commit): Promise<void> {
    for (const proposal of commit.proposals) {
      if (proposal.type === 'add') {
        const kp = proposal.keyPackage
        this.state.members.push({
          leafIndex: this.state.members.length,
          did: kp.leafNode.did,
          encryptionKey: kp.leafNode.encryptionKey,
          signatureKey: kp.leafNode.signatureKey
        })
      } else if (proposal.type === 'remove') {
        const idx = this.state.members.findIndex((m) => m.leafIndex === proposal.leafIndex)
        if (idx >= 0) this.state.members.splice(idx, 1)
      } else if (proposal.type === 'update') {
        const member = this.state.members.find((m) => m.did === proposal.leafNode.did)
        if (member) {
          member.encryptionKey = proposal.leafNode.encryptionKey
          member.signatureKey = proposal.leafNode.signatureKey
        }
      }
    }
    this.state.epochSecret = advanceEpochSecret(this.state.epochSecret, commit.commitSecret)
    this.state.epoch = commit.epoch
  }

  async processWelcome(_welcome: Welcome): Promise<void> {
    // For existing members processing a welcome (no-op — they use processCommit instead)
  }

  async updateKeys(): Promise<Commit> {
    // Generate new encryption keys for this member
    const commitSecret = randomBytes(32)
    const newEpochSecret = advanceEpochSecret(this.state.epochSecret, commitSecret)

    const newEncKey = randomBytes(32)
    const newLeafNode: LeafNode = {
      encryptionKey: newEncKey,
      signatureKey: this.state.mySigningPublicKey,
      did: this.state.members.find((m) => m.leafIndex === this.state.myLeafIndex)!.did
    }

    const proposal: Proposal = { type: 'update', leafNode: newLeafNode }
    const commitData = new TextEncoder().encode(
      JSON.stringify({
        groupId: this.state.groupId,
        epoch: this.state.epoch + 1,
        proposals: [{ type: 'update' }]
      })
    )
    const signature = ed25519.sign(commitData, this.state.mySigningKey)

    const commit: Commit = {
      groupId: this.state.groupId,
      epoch: this.state.epoch + 1,
      proposals: [proposal],
      commitSecret,
      signature
    }

    // Apply locally
    const myMember = this.state.members.find((m) => m.leafIndex === this.state.myLeafIndex)
    if (myMember) myMember.encryptionKey = newEncKey
    this.state.myEncryptionKey = newEncKey
    this.state.epoch += 1
    this.state.epochSecret = newEpochSecret

    return commit
  }

  members(): GroupMember[] {
    return this.state.members.map((m) => ({
      leafIndex: m.leafIndex,
      did: m.did,
      encryptionKey: new Uint8Array(m.encryptionKey),
      signatureKey: new Uint8Array(m.signatureKey)
    }))
  }

  memberCount(): number {
    return this.state.members.length
  }

  exportState(): Uint8Array {
    return serializeGroupState(this.state)
  }
}

// ── MLS Provider Implementation ──

export class SimplifiedMLSProvider implements MLSProvider {
  async createGroup(params: {
    groupId: string
    creatorDID: string
    creatorKeyPair: KeyPair
    creatorEncryptionKeyPair: KeyPair
  }): Promise<MLSGroup> {
    const epochSecret = randomBytes(32)
    const state: GroupState = {
      groupId: params.groupId,
      epoch: 0,
      myLeafIndex: 0,
      members: [
        {
          leafIndex: 0,
          did: params.creatorDID,
          encryptionKey: params.creatorEncryptionKeyPair.publicKey,
          signatureKey: params.creatorKeyPair.publicKey
        }
      ],
      epochSecret,
      mySigningKey: params.creatorKeyPair.secretKey,
      myEncryptionKey: params.creatorEncryptionKeyPair.secretKey,
      mySigningPublicKey: params.creatorKeyPair.publicKey,
      myEncryptionPublicKey: params.creatorEncryptionKeyPair.publicKey
    }
    return new SimplifiedMLSGroup(state)
  }

  async createKeyPackage(params: {
    did: string
    signingKeyPair: KeyPair
    encryptionKeyPair: KeyPair
  }): Promise<KeyPackage> {
    const initKey = params.encryptionKeyPair.publicKey
    const leafNode: LeafNode = {
      encryptionKey: params.encryptionKeyPair.publicKey,
      signatureKey: params.signingKeyPair.publicKey,
      did: params.did
    }
    const data = new TextEncoder().encode(
      JSON.stringify({
        protocolVersion: 1,
        cipherSuite: 1,
        initKey: Array.from(initKey),
        leafNode: { did: params.did }
      })
    )
    const signature = ed25519.sign(data, params.signingKeyPair.secretKey)
    return {
      protocolVersion: 1,
      cipherSuite: 1,
      initKey,
      leafNode,
      signature
    }
  }

  async joinFromWelcome(welcome: Welcome, encryptionKeyPair: KeyPair, signingKeyPair: KeyPair): Promise<MLSGroup> {
    // Decrypt the welcome using the initKey (which is the encryption public key used as HKDF input)
    const welcomeKey = hkdf(
      sha256,
      encryptionKeyPair.publicKey,
      undefined,
      new TextEncoder().encode('harmony-mls-welcome'),
      32
    )
    const nonce = welcome.encryptedGroupState.slice(0, 24)
    const encrypted = welcome.encryptedGroupState.slice(24)
    const cipher = xchacha20poly1305(welcomeKey, nonce)
    const stateBytes = cipher.decrypt(encrypted)
    const state = deserializeGroupState(stateBytes)

    // Set the joining member's own keys (encryption = X25519, signing = Ed25519)
    state.mySigningKey = signingKeyPair.secretKey
    state.myEncryptionKey = encryptionKeyPair.secretKey
    state.mySigningPublicKey = signingKeyPair.publicKey
    state.myEncryptionPublicKey = encryptionKeyPair.publicKey

    return new SimplifiedMLSGroup(state)
  }

  async loadGroup(stateData: Uint8Array, _keyPair: KeyPair): Promise<MLSGroup> {
    const state = deserializeGroupState(stateData)
    return new SimplifiedMLSGroup(state)
  }
}

export function verifyKeyPackageSignature(kp: KeyPackage): boolean {
  const data = new TextEncoder().encode(
    JSON.stringify({
      protocolVersion: kp.protocolVersion,
      cipherSuite: kp.cipherSuite,
      initKey: Array.from(kp.initKey),
      leafNode: { did: kp.leafNode.did }
    })
  )
  try {
    return ed25519.verify(kp.signature, data, kp.leafNode.signatureKey)
  } catch {
    return false
  }
}
