import type { KeyPair } from '@harmony/crypto'

// ── Key Package ──

export interface LeafNode {
  encryptionKey: Uint8Array
  signatureKey: Uint8Array
  did: string
}

export interface KeyPackage {
  protocolVersion: number
  cipherSuite: number
  initKey: Uint8Array
  leafNode: LeafNode
  signature: Uint8Array
}

export interface GroupMember {
  leafIndex: number
  did: string
  encryptionKey: Uint8Array
  signatureKey: Uint8Array
}

// ── MLS Ciphertext ──

export interface MLSCiphertext {
  epoch: number
  senderIndex: number
  ciphertext: Uint8Array
  contentType: 'application' | 'proposal' | 'commit'
}

// ── Welcome & Commit ──

export interface Welcome {
  groupId: string
  epoch: number
  encryptedGroupState: Uint8Array
}

export type Proposal =
  | { type: 'add'; keyPackage: KeyPackage }
  | { type: 'remove'; leafIndex: number }
  | { type: 'update'; leafNode: LeafNode }

export interface Commit {
  groupId: string
  epoch: number
  proposals: Proposal[]
  commitSecret: Uint8Array
  signature: Uint8Array
}

// ── MLS Group interface ──

export interface MLSGroup {
  groupId: string
  epoch: number
  myLeafIndex: number

  encrypt(plaintext: Uint8Array): Promise<MLSCiphertext>
  decrypt(ciphertext: MLSCiphertext): Promise<{ plaintext: Uint8Array; senderIndex: number }>

  addMember(memberKeyPackage: KeyPackage): Promise<{ welcome: Welcome; commit: Commit }>
  removeMember(leafIndex: number): Promise<Commit>
  processCommit(commit: Commit): Promise<void>
  processWelcome(welcome: Welcome): Promise<void>

  updateKeys(): Promise<Commit>

  members(): GroupMember[]
  memberCount(): number
  exportState(): Uint8Array
}

// ── MLS Provider interface ──

export interface MLSProvider {
  createGroup(params: {
    groupId: string
    creatorDID: string
    creatorKeyPair: KeyPair
    creatorEncryptionKeyPair: KeyPair
  }): Promise<MLSGroup>

  createKeyPackage(params: { did: string; signingKeyPair: KeyPair; encryptionKeyPair: KeyPair }): Promise<KeyPackage>

  joinFromWelcome(welcome: Welcome, encryptionKeyPair: KeyPair, signingKeyPair: KeyPair): Promise<MLSGroup>

  loadGroup(state: Uint8Array, keyPair: KeyPair): Promise<MLSGroup>
}

// ── DM types ──

export interface DMCiphertext {
  ciphertext: Uint8Array
  nonce: Uint8Array
  senderPublicKey: Uint8Array
}

export interface DMChannel {
  recipientDID: string
  senderDID: string

  encrypt(plaintext: Uint8Array): Promise<DMCiphertext>
  decrypt(ciphertext: DMCiphertext): Promise<Uint8Array>
}

export interface DMProvider {
  createChannel(params: {
    senderDID: string
    senderKeyPair: KeyPair
    recipientDID: string
    recipientPublicKey: Uint8Array
  }): Promise<DMChannel>

  openChannel(params: {
    recipientDID: string
    recipientKeyPair: KeyPair
    senderDID: string
    senderPublicKey: Uint8Array
  }): Promise<DMChannel>
}
