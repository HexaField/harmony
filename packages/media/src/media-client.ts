import { randomBytes } from '@harmony/crypto'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { computeChecksum, verifyChecksum } from './checksum.js'
import { generateThumbnail } from './thumbnail.js'
import type { MediaStorage, MediaMetadata } from './media-storage.js'

export interface FileInput {
  data: Uint8Array
  filename: string
  contentType: string
  size: number
}

export interface MediaRef {
  id: string
  filename: string
  contentType: string
  size: number
  originalSize: number
  checksum: string
  encryptedChecksum: string
  uploadedBy: string
  uploadedAt: string
  thumbnailId?: string
  url: string
}

export interface DecryptedFile {
  data: Uint8Array
  filename: string
  contentType: string
  size: number
}

export interface UploadOptions {
  generateThumbnail?: boolean
  maxSizeMB?: number
  onProgress?: (progress: UploadProgress) => void
}

export interface UploadProgress {
  uploadId: string
  bytesUploaded: number
  totalBytes: number
  status: 'encrypting' | 'uploading' | 'complete' | 'failed' | 'cancelled'
}

function generateId(): string {
  const bytes = randomBytes(16)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function encryptData(plaintext: Uint8Array, key: Uint8Array): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = randomBytes(24) // XChaCha20 uses 24-byte nonce
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(plaintext)
  return { ciphertext, nonce }
}

function decryptData(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array {
  const cipher = xchacha20poly1305(key, nonce)
  return cipher.decrypt(ciphertext)
}

export class MediaClient {
  private storage: MediaStorage
  private uploads = new Map<string, UploadProgress>()
  private cancelledUploads = new Set<string>()

  constructor(storage: MediaStorage) {
    this.storage = storage
  }

  async uploadFile(
    file: FileInput,
    channelKey: Uint8Array,
    uploaderDID: string,
    communityId: string,
    channelId: string,
    opts?: UploadOptions
  ): Promise<MediaRef> {
    const maxSize = (opts?.maxSizeMB ?? 25) * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error(`File exceeds size limit of ${opts?.maxSizeMB ?? 25}MB`)
    }

    const uploadId = generateId()
    const progress: UploadProgress = {
      uploadId,
      bytesUploaded: 0,
      totalBytes: file.size,
      status: 'encrypting'
    }
    this.uploads.set(uploadId, progress)
    opts?.onProgress?.(progress)

    if (this.cancelledUploads.has(uploadId)) {
      progress.status = 'cancelled'
      opts?.onProgress?.(progress)
      throw new Error('Upload cancelled')
    }

    const plaintextChecksum = computeChecksum(file.data)
    const { ciphertext, nonce } = encryptData(file.data, channelKey)

    // Prepend nonce to ciphertext for storage
    const encrypted = new Uint8Array(nonce.length + ciphertext.length)
    encrypted.set(nonce)
    encrypted.set(ciphertext, nonce.length)

    const encryptedChecksum = computeChecksum(encrypted)

    if (this.cancelledUploads.has(uploadId)) {
      progress.status = 'cancelled'
      opts?.onProgress?.(progress)
      throw new Error('Upload cancelled')
    }

    progress.status = 'uploading'
    opts?.onProgress?.(progress)

    const fileId = generateId()
    const now = new Date().toISOString()

    const meta: MediaMetadata = {
      id: fileId,
      communityId,
      channelId,
      uploadedBy: uploaderDID,
      encryptedSize: encrypted.length,
      contentType: file.contentType,
      createdAt: now
    }

    await this.storage.store_file(encrypted, meta)

    progress.bytesUploaded = file.size
    progress.status = 'complete'
    opts?.onProgress?.(progress)

    let thumbnailId: string | undefined
    const shouldGenerateThumbnail = opts?.generateThumbnail !== false
    if (shouldGenerateThumbnail) {
      const thumb = generateThumbnail(file.data, file.contentType)
      if (thumb) {
        const thumbId = generateId()
        const { ciphertext: thumbCipher, nonce: thumbNonce } = encryptData(thumb, channelKey)
        const encThumb = new Uint8Array(thumbNonce.length + thumbCipher.length)
        encThumb.set(thumbNonce)
        encThumb.set(thumbCipher, thumbNonce.length)

        const thumbMeta: MediaMetadata = {
          id: thumbId,
          communityId,
          channelId,
          uploadedBy: uploaderDID,
          encryptedSize: encThumb.length,
          contentType: 'image/jpeg',
          createdAt: now
        }
        await this.storage.store_file(encThumb, thumbMeta)
        thumbnailId = thumbId
      }
    }

    return {
      id: fileId,
      filename: file.filename,
      contentType: file.contentType,
      size: encrypted.length,
      originalSize: file.size,
      checksum: plaintextChecksum,
      encryptedChecksum,
      uploadedBy: uploaderDID,
      uploadedAt: now,
      thumbnailId,
      url: `/files/${fileId}`
    }
  }

  async downloadFile(ref: MediaRef, channelKey: Uint8Array): Promise<DecryptedFile> {
    const encrypted = await this.storage.retrieve(ref.id)
    if (!encrypted) {
      throw new Error('File not found')
    }

    // Verify encrypted checksum
    if (!verifyChecksum(encrypted, ref.encryptedChecksum)) {
      throw new Error('Encrypted checksum mismatch')
    }

    const nonce = encrypted.slice(0, 24)
    const ciphertext = encrypted.slice(24)
    const plaintext = decryptData(ciphertext, nonce, channelKey)

    // Verify plaintext checksum
    if (!verifyChecksum(plaintext, ref.checksum)) {
      throw new Error('Plaintext checksum mismatch')
    }

    return {
      data: plaintext,
      filename: ref.filename,
      contentType: ref.contentType,
      size: plaintext.length
    }
  }

  getUploadProgress(uploadId: string): UploadProgress | null {
    return this.uploads.get(uploadId) ?? null
  }

  cancelUpload(uploadId: string): void {
    this.cancelledUploads.add(uploadId)
    const progress = this.uploads.get(uploadId)
    if (progress && progress.status !== 'complete') {
      progress.status = 'cancelled'
    }
  }
}
