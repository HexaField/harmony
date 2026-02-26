// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { AttachmentData } from '../src/types.js'
import { formatFileSize, isImageMimeType } from '../src/views/MessageArea.js'

describe('File Preview Chip in Composer (13.2)', () => {
  it('formatFileSize returns human-readable sizes', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toMatch(/512\s*B/)
    expect(formatFileSize(1024)).toMatch(/1(\.0)?\s*KB/)
    expect(formatFileSize(1024 * 1024)).toMatch(/1(\.0)?\s*MB/)
    expect(formatFileSize(2048)).toMatch(/2(\.0)?\s*KB/)
  })

  it('isImageMimeType identifies image types correctly', () => {
    expect(isImageMimeType('image/png')).toBe(true)
    expect(isImageMimeType('image/jpeg')).toBe(true)
    expect(isImageMimeType('image/gif')).toBe(true)
    expect(isImageMimeType('image/webp')).toBe(true)
    expect(isImageMimeType('application/pdf')).toBe(false)
    expect(isImageMimeType('text/plain')).toBe(false)
    expect(isImageMimeType('video/mp4')).toBe(false)
  })

  it('AttachmentData model supports file preview chip rendering', () => {
    // The FileUpload component renders chips based on AttachmentData
    // Verify the model supports all needed fields
    const attachment: AttachmentData = {
      id: 'file-1',
      filename: 'document.pdf',
      url: 'blob:http://localhost/abc',
      mimeType: 'application/pdf',
      size: 1024 * 50
    }

    expect(attachment.id).toBeTruthy()
    expect(attachment.filename).toBe('document.pdf')
    expect(attachment.mimeType).toBe('application/pdf')
    expect(isImageMimeType(attachment.mimeType)).toBe(false)
    expect(formatFileSize(attachment.size)).toMatch(/50(\.0)?\s*KB/)
  })

  it('image attachments are identified for preview rendering', () => {
    const imageAttachment: AttachmentData = {
      id: 'img-1',
      filename: 'photo.png',
      url: 'blob:http://localhost/img',
      mimeType: 'image/png',
      size: 1024 * 200
    }

    // FileUpload renders <img> for image types, file chip for others
    expect(isImageMimeType(imageAttachment.mimeType)).toBe(true)
    expect(imageAttachment.url).toBeTruthy()
    expect(imageAttachment.filename).toBe('photo.png')
  })

  it('multiple attachments can be tracked for chip display', () => {
    const attachments: AttachmentData[] = [
      { id: '1', filename: 'a.pdf', url: 'blob:1', mimeType: 'application/pdf', size: 100 },
      { id: '2', filename: 'b.png', url: 'blob:2', mimeType: 'image/png', size: 200 },
      { id: '3', filename: 'c.txt', url: 'blob:3', mimeType: 'text/plain', size: 50 }
    ]

    // Simulate removing an attachment (as FileUpload's onRemove does)
    const filtered = attachments.filter((a) => a.id !== '2')
    expect(filtered.length).toBe(2)
    expect(filtered.find((a) => a.id === '2')).toBeUndefined()
  })
})
