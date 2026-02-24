import { describe, it, expect } from 'vitest'
import { en, t } from '../src/i18n/strings.js'
import { formatFileSize, isImageMimeType } from '../src/views/MessageArea.tsx'
import type { MessageData, AttachmentData } from '../src/types.js'

describe('File upload utilities', () => {
  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 B')
    })
    it('formats kilobytes', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })
    it('formats megabytes', () => {
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
    })
    it('formats zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
    })
    it('formats large files', () => {
      expect(formatFileSize(25 * 1024 * 1024)).toBe('25.0 MB')
    })
  })

  describe('isImageMimeType', () => {
    it('recognises jpeg', () => {
      expect(isImageMimeType('image/jpeg')).toBe(true)
    })
    it('recognises png', () => {
      expect(isImageMimeType('image/png')).toBe(true)
    })
    it('recognises gif', () => {
      expect(isImageMimeType('image/gif')).toBe(true)
    })
    it('recognises webp', () => {
      expect(isImageMimeType('image/webp')).toBe(true)
    })
    it('rejects application/pdf', () => {
      expect(isImageMimeType('application/pdf')).toBe(false)
    })
    it('rejects video/mp4', () => {
      expect(isImageMimeType('video/mp4')).toBe(false)
    })
    it('rejects empty string', () => {
      expect(isImageMimeType('')).toBe(false)
    })
    it('rejects image/svg+xml (not in supported list)', () => {
      expect(isImageMimeType('image/svg+xml')).toBe(false)
    })
  })
})

describe('MessageData with attachments', () => {
  it('supports messages without attachments', () => {
    const msg: MessageData = {
      id: '1',
      content: 'hello',
      authorDid: 'did:test:1',
      authorName: 'Alice',
      timestamp: new Date().toISOString(),
      reactions: []
    }
    expect(msg.attachments).toBeUndefined()
  })

  it('supports messages with image attachments', () => {
    const attachment: AttachmentData = {
      id: 'att-1',
      filename: 'photo.jpg',
      url: 'https://example.com/photo.jpg',
      mimeType: 'image/jpeg',
      size: 1024 * 100
    }
    const msg: MessageData = {
      id: '2',
      content: 'Check this out',
      authorDid: 'did:test:1',
      authorName: 'Alice',
      timestamp: new Date().toISOString(),
      reactions: [],
      attachments: [attachment]
    }
    expect(msg.attachments).toHaveLength(1)
    expect(msg.attachments![0].filename).toBe('photo.jpg')
    expect(isImageMimeType(msg.attachments![0].mimeType)).toBe(true)
  })

  it('supports messages with file attachments', () => {
    const msg: MessageData = {
      id: '3',
      content: '',
      authorDid: 'did:test:1',
      authorName: 'Alice',
      timestamp: new Date().toISOString(),
      reactions: [],
      attachments: [
        {
          id: 'att-2',
          filename: 'document.pdf',
          url: 'https://example.com/document.pdf',
          mimeType: 'application/pdf',
          size: 2 * 1024 * 1024
        }
      ]
    }
    expect(msg.attachments![0].mimeType).toBe('application/pdf')
    expect(isImageMimeType(msg.attachments![0].mimeType)).toBe(false)
  })

  it('supports multiple attachments', () => {
    const msg: MessageData = {
      id: '4',
      content: 'files',
      authorDid: 'did:test:1',
      authorName: 'Alice',
      timestamp: new Date().toISOString(),
      reactions: [],
      attachments: [
        { id: 'a1', filename: 'a.png', url: '/a.png', mimeType: 'image/png', size: 100 },
        { id: 'a2', filename: 'b.zip', url: '/b.zip', mimeType: 'application/zip', size: 5000 }
      ]
    }
    expect(msg.attachments).toHaveLength(2)
  })
})

describe('i18n - file upload strings', () => {
  it('has FILE_UPLOAD_BUTTON string', () => {
    expect(en.FILE_UPLOAD_BUTTON).toBeDefined()
  })
  it('has FILE_UPLOAD_DROP_ZONE string', () => {
    expect(en.FILE_UPLOAD_DROP_ZONE).toBeDefined()
  })
  it('has FILE_UPLOAD_SIZE_LIMIT string', () => {
    expect(en.FILE_UPLOAD_SIZE_LIMIT).toBeDefined()
  })
  it('has FILE_UPLOAD_TOO_LARGE string', () => {
    expect(en.FILE_UPLOAD_TOO_LARGE).toBeDefined()
  })
  it('has FILE_UPLOAD_FAILED string', () => {
    expect(en.FILE_UPLOAD_FAILED).toBeDefined()
  })
  it('has FILE_UPLOAD_UPLOADING string', () => {
    expect(en.FILE_UPLOAD_UPLOADING).toBeDefined()
  })
  it('has FILE_UPLOAD_PROCESSING string', () => {
    expect(en.FILE_UPLOAD_PROCESSING).toBeDefined()
  })
  it('has FILE_DOWNLOAD string', () => {
    expect(en.FILE_DOWNLOAD).toBeDefined()
  })
  it('interpolates FILE_UPLOAD_TOO_LARGE', () => {
    const result = t('FILE_UPLOAD_TOO_LARGE', { maxSize: '25.0 MB' })
    expect(result).toContain('25.0 MB')
  })
  it('interpolates FILE_UPLOAD_UPLOADING', () => {
    const result = t('FILE_UPLOAD_UPLOADING', { filename: 'test.png' })
    expect(result).toContain('test.png')
  })
})

describe('File upload UI', () => {
  it.skip('renders 📎 button that opens file picker (requires DOM)', () => {
    // Requires rendering SolidJS components in a DOM environment with jsdom/happy-dom
  })

  it.skip('renders drag-and-drop overlay when dragging files (requires DOM)', () => {
    // Requires DragEvent simulation in a DOM environment
  })

  it.skip('renders image attachments inline with lightbox (requires DOM)', () => {
    // Requires rendering message components with image elements
  })

  it.skip('calls client.uploadFile on file select (requires client mock)', () => {
    // Requires mocking HarmonyClient and the full store context
  })

  it.skip('shows upload progress spinner while uploading (requires DOM)', () => {
    // Requires async rendering with state transitions
  })

  it.skip('supports paste from clipboard (requires ClipboardEvent)', () => {
    // Requires ClipboardEvent with DataTransfer items in a DOM context
  })
})
