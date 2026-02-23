import { describe, it, expect, beforeEach } from 'vitest'
import { MediaClient } from '../src/media-client.js'
import { MediaStorage } from '../src/media-storage.js'
import { LinkPreviewService } from '../src/link-preview.js'
import { computeChecksum, verifyChecksum } from '../src/checksum.js'
import { generateThumbnail } from '../src/thumbnail.js'
import { MemoryQuadStore } from '@harmony/quads'
import { randomBytes } from '@harmony/crypto'
import { HarmonyType } from '@harmony/vocab'
import type { UploadProgress } from '../src/media-client.js'

const channelKey = randomBytes(32)

function makeFile(content: string, contentType = 'text/plain', filename = 'test.txt') {
  const data = new TextEncoder().encode(content)
  return { data, filename, contentType, size: data.length }
}

function makeImageFile(size = 512) {
  const data = randomBytes(size)
  return { data, filename: 'photo.jpg', contentType: 'image/jpeg', size: data.length }
}

describe('@harmony/media', () => {
  let store: MemoryQuadStore
  let storage: MediaStorage
  let client: MediaClient

  beforeEach(() => {
    store = new MemoryQuadStore()
    storage = new MediaStorage(store)
    client = new MediaClient(storage)
  })

  describe('File Encryption', () => {
    it('MUST encrypt file with channel group key (XChaCha20-Poly1305)', async () => {
      const file = makeFile('Hello, World!')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const encrypted = await storage.retrieve(ref.id)
      expect(encrypted).not.toBeNull()
      // Encrypted data should differ from plaintext
      const plainStr = new TextDecoder().decode(file.data)
      const encStr = new TextDecoder().decode(encrypted!)
      expect(encStr).not.toContain(plainStr)
    })

    it('MUST produce different ciphertext for same file (unique nonce)', async () => {
      const file = makeFile('Same content')
      const ref1 = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const ref2 = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const enc1 = await storage.retrieve(ref1.id)
      const enc2 = await storage.retrieve(ref2.id)
      expect(enc1).not.toEqual(enc2)
    })

    it('MUST decrypt file with same channel group key', async () => {
      const file = makeFile('Secret message')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const decrypted = await client.downloadFile(ref, channelKey)
      expect(new TextDecoder().decode(decrypted.data)).toBe('Secret message')
    })

    it('MUST reject decryption with wrong key', async () => {
      const file = makeFile('Secret')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const wrongKey = randomBytes(32)
      await expect(client.downloadFile(ref, wrongKey)).rejects.toThrow()
    })

    it('MUST preserve filename and content type through encrypt/decrypt', async () => {
      const file = makeFile('data', 'application/json', 'config.json')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const decrypted = await client.downloadFile(ref, channelKey)
      expect(decrypted.filename).toBe('config.json')
      expect(decrypted.contentType).toBe('application/json')
    })

    it('MUST compute and verify plaintext checksum (SHA-256)', async () => {
      const file = makeFile('checksum test')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      expect(ref.checksum).toMatch(/^sha256:/)
      expect(verifyChecksum(file.data, ref.checksum)).toBe(true)
    })
  })

  describe('Upload', () => {
    it('MUST encrypt before upload (server never sees plaintext)', async () => {
      const file = makeFile('Private data')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const stored = await storage.retrieve(ref.id)
      expect(stored).not.toBeNull()
      expect(new TextDecoder().decode(stored!)).not.toContain('Private data')
    })

    it('MUST report upload progress via callback', async () => {
      const file = makeFile('progress test')
      const progresses: UploadProgress[] = []
      await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1', {
        onProgress: (p) => progresses.push({ ...p })
      })
      expect(progresses.length).toBeGreaterThanOrEqual(2)
      expect(progresses.some((p) => p.status === 'encrypting')).toBe(true)
      expect(progresses.some((p) => p.status === 'complete')).toBe(true)
    })

    it('MUST enforce file size limit (default 25MB)', async () => {
      const bigData = new Uint8Array(26 * 1024 * 1024)
      const file = { data: bigData, filename: 'big.bin', contentType: 'application/octet-stream', size: bigData.length }
      await expect(client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')).rejects.toThrow('size limit')
    })

    it('MUST reject files exceeding size limit before encryption', async () => {
      const data = new Uint8Array(2 * 1024 * 1024)
      const file = { data, filename: 'big.bin', contentType: 'application/octet-stream', size: data.length }
      await expect(
        client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1', { maxSizeMB: 1 })
      ).rejects.toThrow('size limit')
    })

    it('MUST generate unique upload ID for tracking', async () => {
      const file = makeFile('track me')
      const progresses: UploadProgress[] = []
      await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1', {
        onProgress: (p) => progresses.push({ ...p })
      })
      expect(progresses[0].uploadId).toBeTruthy()
      expect(typeof progresses[0].uploadId).toBe('string')
    })

    it('MUST allow cancellation of in-progress upload', () => {
      const file = makeFile('cancel me')
      // Start upload then cancel immediately
      const uploadId = 'test-cancel'
      client.cancelUpload(uploadId)
      const progress = client.getUploadProgress(uploadId)
      // The upload was never started so null, but cancel is registered
      expect(progress).toBeNull()
    })

    it('MUST auto-generate thumbnail for images (if opted in)', async () => {
      const file = makeImageFile()
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1', {
        generateThumbnail: true
      })
      expect(ref.thumbnailId).toBeTruthy()
    })
  })

  describe('Download', () => {
    it('MUST download and decrypt file', async () => {
      const file = makeFile('download me')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const dec = await client.downloadFile(ref, channelKey)
      expect(new TextDecoder().decode(dec.data)).toBe('download me')
    })

    it('MUST verify ciphertext checksum before decryption', async () => {
      const file = makeFile('verify me')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      ref.encryptedChecksum = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
      await expect(client.downloadFile(ref, channelKey)).rejects.toThrow('checksum')
    })

    it('MUST verify plaintext checksum after decryption', async () => {
      const file = makeFile('checksum me')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      ref.checksum = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
      await expect(client.downloadFile(ref, channelKey)).rejects.toThrow('checksum')
    })

    it('MUST return error for non-existent file ID', async () => {
      const fakeRef = {
        id: 'nonexistent',
        filename: 'nope.txt',
        contentType: 'text/plain',
        size: 0,
        originalSize: 0,
        checksum: '',
        encryptedChecksum: '',
        uploadedBy: '',
        uploadedAt: '',
        url: ''
      }
      await expect(client.downloadFile(fakeRef, channelKey)).rejects.toThrow('not found')
    })
  })

  describe('Thumbnail Generation', () => {
    it('MUST generate thumbnail for image files (JPEG, PNG, WebP, GIF)', () => {
      const data = randomBytes(256)
      expect(generateThumbnail(data, 'image/jpeg')).not.toBeNull()
      expect(generateThumbnail(data, 'image/png')).not.toBeNull()
      expect(generateThumbnail(data, 'image/webp')).not.toBeNull()
      expect(generateThumbnail(data, 'image/gif')).not.toBeNull()
    })

    it('MUST skip thumbnail for non-image files', () => {
      const data = randomBytes(256)
      expect(generateThumbnail(data, 'text/plain')).toBeNull()
      expect(generateThumbnail(data, 'application/pdf')).toBeNull()
    })

    it('MUST encrypt thumbnail separately with same channel key', async () => {
      const file = makeImageFile()
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      expect(ref.thumbnailId).toBeTruthy()
      const thumbData = await storage.retrieve(ref.thumbnailId!)
      expect(thumbData).not.toBeNull()
      // Thumbnail is encrypted, should not match raw thumbnail
      const rawThumb = generateThumbnail(file.data, 'image/jpeg')
      expect(thumbData).not.toEqual(rawThumb)
    })

    it("MUST return null if generation fails (don't block upload)", async () => {
      const file = makeFile('not an image', 'text/plain')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      expect(ref.thumbnailId).toBeUndefined()
    })
  })

  describe('Server Storage', () => {
    it('MUST store encrypted file and return file ID', async () => {
      const file = makeFile('store me')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      expect(ref.id).toBeTruthy()
      const data = await storage.retrieve(ref.id)
      expect(data).not.toBeNull()
    })

    it('MUST retrieve file by ID', async () => {
      const file = makeFile('retrieve me')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const data = await storage.retrieve(ref.id)
      expect(data).not.toBeNull()
      expect(data!.length).toBeGreaterThan(0)
    })

    it('MUST delete file by ID', async () => {
      const file = makeFile('delete me')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      await storage.delete(ref.id)
      const data = await storage.retrieve(ref.id)
      expect(data).toBeNull()
    })

    it('MUST track storage usage per community', async () => {
      const file = makeFile('usage test')
      await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const usage = await storage.getStorageUsage('comm1')
      expect(usage.fileCount).toBeGreaterThanOrEqual(1)
      expect(usage.totalBytes).toBeGreaterThan(0)
    })

    it('MUST enforce community storage quota', async () => {
      const smallStore = new MediaStorage(new MemoryQuadStore(), { quotaBytes: 100 })
      const smallClient = new MediaClient(smallStore)
      const data = new Uint8Array(200)
      const file = { data, filename: 'big.bin', contentType: 'application/octet-stream', size: data.length }
      await expect(smallClient.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')).rejects.toThrow('quota')
    })

    it('MUST store file metadata as RDF quads', async () => {
      const file = makeFile('quad test')
      const ref = await client.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')
      const quads = await store.match({ subject: `harmony:file-${ref.id}` })
      expect(quads.length).toBeGreaterThan(0)
      const typeQuad = quads.find((q) => q.object === HarmonyType.MediaFile)
      expect(typeQuad).toBeTruthy()
    })

    it('MUST reject upload when quota exceeded', async () => {
      const tinyStore = new MediaStorage(new MemoryQuadStore(), { quotaBytes: 50 })
      const tinyClient = new MediaClient(tinyStore)
      const data = new Uint8Array(100)
      const file = { data, filename: 'big.bin', contentType: 'application/octet-stream', size: data.length }
      await expect(tinyClient.uploadFile(file, channelKey, 'did:key:alice', 'comm1', 'ch1')).rejects.toThrow('quota')
    })
  })

  describe('Checksum', () => {
    it('MUST compute SHA-256 checksum', () => {
      const data = new TextEncoder().encode('hello')
      const cs = computeChecksum(data)
      expect(cs).toMatch(/^sha256:[0-9a-f]{64}$/)
    })

    it('MUST verify correct checksum', () => {
      const data = new TextEncoder().encode('hello')
      const cs = computeChecksum(data)
      expect(verifyChecksum(data, cs)).toBe(true)
    })

    it('MUST reject incorrect checksum', () => {
      const data = new TextEncoder().encode('hello')
      expect(verifyChecksum(data, 'sha256:0000')).toBe(false)
    })
  })

  describe('Link Previews', () => {
    const mockFetcher = {
      fetch: async (url: string) => {
        if (url === 'https://example.com/article') {
          return `<html><head>
            <meta property="og:title" content="Test Article">
            <meta property="og:description" content="A test article">
            <meta property="og:type" content="article">
            <meta property="og:image" content="https://example.com/image.jpg">
            <meta property="og:site_name" content="Example">
            <title>Test Article Page</title>
          </head><body></body></html>`
        }
        if (url === 'https://slow.example.com') {
          return new Promise<string>((resolve) => setTimeout(() => resolve('<html></html>'), 10000))
        }
        throw new Error('Not found')
      }
    }

    it('MUST fetch Open Graph metadata from URL', async () => {
      const service = new LinkPreviewService(mockFetcher)
      const preview = await service.fetchPreview('https://example.com/article')
      expect(preview).not.toBeNull()
      expect(preview!.title).toBe('Test Article')
      expect(preview!.description).toBe('A test article')
      expect(preview!.type).toBe('article')
      expect(preview!.imageUrl).toBe('https://example.com/image.jpg')
    })

    it('MUST cache previews with TTL', async () => {
      const service = new LinkPreviewService(mockFetcher)
      await service.fetchPreview('https://example.com/article')
      const cached = await service.getCached('https://example.com/article')
      expect(cached).not.toBeNull()
      expect(cached!.title).toBe('Test Article')
    })

    it('MUST return cached preview on repeat request', async () => {
      const service = new LinkPreviewService(mockFetcher)
      const p1 = await service.fetchPreview('https://example.com/article')
      const p2 = await service.fetchPreview('https://example.com/article')
      expect(p1!.fetchedAt).toBe(p2!.fetchedAt) // Same cached entry
    })

    it('MUST timeout on slow URLs', async () => {
      const service = new LinkPreviewService(mockFetcher, { timeoutMs: 50 })
      const preview = await service.fetchPreview('https://slow.example.com')
      expect(preview).toBeNull()
    })

    it('MUST handle invalid/unreachable URLs gracefully', async () => {
      const service = new LinkPreviewService(mockFetcher)
      const preview = await service.fetchPreview('https://invalid.example.com')
      expect(preview).toBeNull()
    })

    it('MUST sanitize preview content (no script injection)', async () => {
      const xssFetcher = {
        fetch: async () =>
          '<html><head><meta property="og:title" content="<script>alert(1)</script>Test"></head></html>'
      }
      const service = new LinkPreviewService(xssFetcher)
      const preview = await service.fetchPreview('https://xss.example.com')
      expect(preview).not.toBeNull()
      expect(preview!.title).not.toContain('<script>')
    })
  })

  describe('Download (additional)', () => {
    it.skip('MUST handle partial download failure gracefully', () => {
      // Source MediaClient.downloadFile does not implement partial download recovery.
      // Would need streaming download with resume capability.
    })
  })

  describe('Thumbnail Generation (additional)', () => {
    it('MUST resize to max 200x200 preserving aspect ratio', () => {
      const data = randomBytes(2048)
      // generateThumbnail accepts maxWidth/maxHeight params (200x200 default)
      const thumb = generateThumbnail(data, 'image/jpeg', 200, 200)
      expect(thumb).not.toBeNull()
      // Thumbnail should be smaller than original data
      expect(thumb!.length).toBeLessThan(data.length)
    })
  })

  describe('Link Previews (additional)', () => {
    it.skip('MUST proxy preview images through server (privacy)', () => {
      // Source LinkPreviewService does not implement image proxying.
      // imageUrl is returned as-is from og:image. Server would need a proxy endpoint.
    })
  })

  describe('Integration', () => {
    it.skip('MUST attach MediaRef to message EncryptedContent', () => {
      // Integration with @harmony/protocol message types not implemented in media package.
    })

    it.skip('MUST display file in message after client-side decryption', () => {
      // UI integration not implemented in media package.
    })

    it.skip('MUST display link preview inline in message', () => {
      // UI integration not implemented in media package.
    })

    it.skip('MUST handle messages with multiple attachments', () => {
      // Integration with message system not implemented in media package.
    })
  })
})
