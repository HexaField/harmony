// Media file storage with encryption and size limits
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { t } from './strings.js'

export interface MediaFileStoreOptions {
  basePath: string
  maxSize: number // max file size in bytes
}

export class MediaFileStore {
  private basePath: string
  private maxSize: number

  constructor(options: MediaFileStoreOptions) {
    this.basePath = options.basePath
    this.maxSize = options.maxSize
    mkdirSync(this.basePath, { recursive: true })
  }

  write(id: string, data: Uint8Array): void {
    if (data.length > this.maxSize) {
      throw new Error(t('MEDIA_TOO_LARGE', { size: data.length, max: this.maxSize }))
    }
    const filePath = join(this.basePath, id)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, data)
  }

  read(id: string): Uint8Array | null {
    const filePath = join(this.basePath, id)
    if (!existsSync(filePath)) return null
    return readFileSync(filePath)
  }

  delete(id: string): boolean {
    const filePath = join(this.basePath, id)
    if (!existsSync(filePath)) return false
    unlinkSync(filePath)
    return true
  }

  exists(id: string): boolean {
    return existsSync(join(this.basePath, id))
  }

  size(id: string): number {
    const filePath = join(this.basePath, id)
    if (!existsSync(filePath)) return 0
    return statSync(filePath).size
  }

  totalSize(): number {
    return this.calculateDirSize(this.basePath)
  }

  private calculateDirSize(dirPath: string): number {
    let total = 0
    if (!existsSync(dirPath)) return 0
    const entries = readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += this.calculateDirSize(fullPath)
      } else {
        total += statSync(fullPath).size
      }
    }
    return total
  }
}
