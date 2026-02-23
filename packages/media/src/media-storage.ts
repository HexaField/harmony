import type { Quad, QuadStore } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'

export interface MediaMetadata {
  id: string
  communityId: string
  channelId: string
  uploadedBy: string
  encryptedSize: number
  contentType: string
  createdAt: string
}

export interface StorageUsage {
  totalBytes: number
  fileCount: number
  limitBytes: number
}

export class MediaStorage {
  private files = new Map<string, Uint8Array>()
  private metadata = new Map<string, MediaMetadata>()
  private store: QuadStore
  private quotaBytes: number

  constructor(store: QuadStore, opts?: { quotaBytes?: number }) {
    this.store = store
    this.quotaBytes = opts?.quotaBytes ?? 1024 * 1024 * 1024 // 1GB default
  }

  async store_file(encryptedData: Uint8Array, meta: MediaMetadata): Promise<string> {
    const usage = await this.getStorageUsage(meta.communityId)
    if (usage.totalBytes + encryptedData.length > this.quotaBytes) {
      throw new Error('Storage quota exceeded')
    }

    this.files.set(meta.id, encryptedData)
    this.metadata.set(meta.id, meta)

    const graph = `community:${meta.communityId}`
    const subject = `harmony:file-${meta.id}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.MediaFile, graph },
      {
        subject,
        predicate: HarmonyPredicate.filename,
        object: { value: meta.id, datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.contentType,
        object: { value: meta.contentType, datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.encryptedSize,
        object: { value: String(meta.encryptedSize), datatype: XSDDatatype.integer },
        graph
      },
      { subject, predicate: HarmonyPredicate.uploadedBy, object: meta.uploadedBy, graph },
      {
        subject,
        predicate: HarmonyPredicate.channelId,
        object: meta.channelId,
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.timestamp,
        object: { value: meta.createdAt, datatype: XSDDatatype.dateTime },
        graph
      }
    ]
    await this.store.addAll(quads)

    return meta.id
  }

  async retrieve(fileId: string): Promise<Uint8Array | null> {
    return this.files.get(fileId) ?? null
  }

  async delete(fileId: string): Promise<void> {
    const meta = this.metadata.get(fileId)
    if (meta) {
      const graph = `community:${meta.communityId}`
      const subject = `harmony:file-${fileId}`
      const quads = await this.store.match({ subject, graph })
      for (const q of quads) {
        await this.store.remove(q)
      }
    }
    this.files.delete(fileId)
    this.metadata.delete(fileId)
  }

  async getMetadata(fileId: string): Promise<MediaMetadata | null> {
    return this.metadata.get(fileId) ?? null
  }

  async getStorageUsage(communityId: string): Promise<StorageUsage> {
    let totalBytes = 0
    let fileCount = 0
    for (const [, meta] of this.metadata) {
      if (meta.communityId === communityId) {
        totalBytes += meta.encryptedSize
        fileCount++
      }
    }
    return { totalBytes, fileCount, limitBytes: this.quotaBytes }
  }
}
