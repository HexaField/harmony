import type { CryptoProvider, EncryptedPayload } from '@harmony/crypto'

export interface ManagedInstance {
  id: string
  name: string
  ownerDID: string
  createdAt: string
  status: 'active' | 'suspended' | 'deleted'
  memberCount: number
  storageUsedBytes: number
  maxStorageBytes: number
}

export interface StoredBlob {
  id: string
  instanceId: string
  uploaderDID: string
  encrypted: EncryptedPayload
  createdAt: string
  sizeBytes: number
}

export class HostingService {
  private instances: Map<string, ManagedInstance> = new Map()
  private storage: Map<string, StoredBlob> = new Map() // blobId → blob
  private instanceBlobs: Map<string, Set<string>> = new Map() // instanceId → blobIds
  private maxInstancesPerUser: number
  private defaultMaxStorageBytes: number

  constructor(_crypto: CryptoProvider, options?: { maxInstancesPerUser?: number; defaultMaxStorageBytes?: number }) {
    this.maxInstancesPerUser = options?.maxInstancesPerUser ?? 5
    this.defaultMaxStorageBytes = options?.defaultMaxStorageBytes ?? 100 * 1024 * 1024 // 100MB
  }

  async createInstance(params: { name: string; ownerDID: string }): Promise<ManagedInstance> {
    // Check quota
    const owned = this.listInstances(params.ownerDID)
    if (owned.length >= this.maxInstancesPerUser) {
      throw new Error('Instance quota exceeded')
    }

    const id = 'inst_' + Array.from({ length: 12 }, () => Math.random().toString(36)[2]).join('')
    const instance: ManagedInstance = {
      id,
      name: params.name,
      ownerDID: params.ownerDID,
      createdAt: new Date().toISOString(),
      status: 'active',
      memberCount: 0,
      storageUsedBytes: 0,
      maxStorageBytes: this.defaultMaxStorageBytes
    }
    this.instances.set(id, instance)
    this.instanceBlobs.set(id, new Set())
    return instance
  }

  getInstance(id: string): ManagedInstance | null {
    return this.instances.get(id) ?? null
  }

  listInstances(ownerDID: string): ManagedInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.ownerDID === ownerDID && i.status !== 'deleted')
  }

  async deleteInstance(id: string, requesterDID: string): Promise<void> {
    const inst = this.instances.get(id)
    if (!inst) throw new Error('Instance not found')
    if (inst.ownerDID !== requesterDID) throw new Error('Unauthorized')
    inst.status = 'deleted'

    // Clean up blobs
    const blobIds = this.instanceBlobs.get(id)
    if (blobIds) {
      for (const blobId of blobIds) this.storage.delete(blobId)
      this.instanceBlobs.delete(id)
    }
  }

  async suspendInstance(id: string): Promise<void> {
    const inst = this.instances.get(id)
    if (!inst) throw new Error('Instance not found')
    inst.status = 'suspended'
  }

  async uploadBlob(params: { instanceId: string; uploaderDID: string; data: EncryptedPayload }): Promise<StoredBlob> {
    const inst = this.instances.get(params.instanceId)
    if (!inst) throw new Error('Instance not found')
    if (inst.status !== 'active') throw new Error('Instance is not active')

    const sizeBytes = params.data.ciphertext.length + params.data.nonce.length
    if (inst.storageUsedBytes + sizeBytes > inst.maxStorageBytes) {
      throw new Error('Storage quota exceeded')
    }

    const blobId = 'blob_' + Array.from({ length: 12 }, () => Math.random().toString(36)[2]).join('')
    const blob: StoredBlob = {
      id: blobId,
      instanceId: params.instanceId,
      uploaderDID: params.uploaderDID,
      encrypted: params.data,
      createdAt: new Date().toISOString(),
      sizeBytes
    }

    this.storage.set(blobId, blob)
    this.instanceBlobs.get(params.instanceId)!.add(blobId)
    inst.storageUsedBytes += sizeBytes

    return blob
  }

  getBlob(blobId: string): StoredBlob | null {
    return this.storage.get(blobId) ?? null
  }

  async deleteBlob(blobId: string, requesterDID: string): Promise<void> {
    const blob = this.storage.get(blobId)
    if (!blob) throw new Error('Blob not found')

    const inst = this.instances.get(blob.instanceId)
    if (!inst) throw new Error('Instance not found')
    if (inst.ownerDID !== requesterDID && blob.uploaderDID !== requesterDID) {
      throw new Error('Unauthorized')
    }

    inst.storageUsedBytes -= blob.sizeBytes
    this.storage.delete(blobId)
    this.instanceBlobs.get(blob.instanceId)?.delete(blobId)
  }

  listBlobs(instanceId: string): StoredBlob[] {
    const blobIds = this.instanceBlobs.get(instanceId)
    if (!blobIds) return []
    return Array.from(blobIds)
      .map((id) => this.storage.get(id)!)
      .filter(Boolean)
  }
}
