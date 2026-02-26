import { describe, it, expect } from 'vitest'
import { formatFileSize, isImageMimeType } from '../src/views/MessageArea.js'

describe('File Upload Utilities', () => {
  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 B')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
    })

    it('should format zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
    })

    it('should format exactly 1 KB', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB')
    })

    it('should format exactly 1 MB', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    })
  })

  describe('isImageMimeType', () => {
    it('should return true for JPEG', () => {
      expect(isImageMimeType('image/jpeg')).toBe(true)
    })

    it('should return true for PNG', () => {
      expect(isImageMimeType('image/png')).toBe(true)
    })

    it('should return true for GIF', () => {
      expect(isImageMimeType('image/gif')).toBe(true)
    })

    it('should return true for WebP', () => {
      expect(isImageMimeType('image/webp')).toBe(true)
    })

    it('should return false for PDF', () => {
      expect(isImageMimeType('application/pdf')).toBe(false)
    })

    it('should return false for text', () => {
      expect(isImageMimeType('text/plain')).toBe(false)
    })

    it('should return false for SVG', () => {
      expect(isImageMimeType('image/svg+xml')).toBe(false)
    })
  })
})
