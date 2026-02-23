export interface LinkPreview {
  url: string
  title?: string
  description?: string
  siteName?: string
  imageUrl?: string
  faviconUrl?: string
  type: 'article' | 'video' | 'image' | 'rich' | 'unknown'
  fetchedAt: string
  ttlSeconds: number
}

interface LinkPreviewFetcher {
  fetch(url: string): Promise<string>
}

/** Simple HTML meta tag parser — no dependencies */
function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {}
  const metaRegex =
    /<meta\s+(?:[^>]*?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']+)["']|[^>]*?content\s*=\s*["']([^"']+)["'][^>]*?(?:property|name)\s*=\s*["']([^"']+)["'])[^>]*\/?>/gi
  let match: RegExpExecArray | null
  while ((match = metaRegex.exec(html)) !== null) {
    const key = match[1] || match[4]
    const value = match[2] || match[3]
    if (key && value) {
      meta[key.toLowerCase()] = value
    }
  }
  // Title tag fallback
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    meta['title'] = titleMatch[1]
  }
  return meta
}

function sanitize(text: string | undefined): string | undefined {
  if (!text) return undefined
  return text.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }
    return map[c] || c
  })
}

function detectType(meta: Record<string, string>): LinkPreview['type'] {
  const ogType = meta['og:type']
  if (ogType) {
    if (ogType.includes('video')) return 'video'
    if (ogType.includes('image') || ogType.includes('photo')) return 'image'
    if (ogType.includes('article')) return 'article'
    if (ogType.includes('rich')) return 'rich'
  }
  return 'unknown'
}

export class LinkPreviewService {
  private cache = new Map<string, { preview: LinkPreview; expiresAt: number }>()
  private fetcher: LinkPreviewFetcher
  private timeoutMs: number
  private defaultTTL: number

  constructor(fetcher: LinkPreviewFetcher, opts?: { timeoutMs?: number; defaultTTL?: number }) {
    this.fetcher = fetcher
    this.timeoutMs = opts?.timeoutMs ?? 5000
    this.defaultTTL = opts?.defaultTTL ?? 86400
  }

  async getCached(url: string): Promise<LinkPreview | null> {
    const entry = this.cache.get(url)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(url)
      return null
    }
    return entry.preview
  }

  async fetchPreview(url: string): Promise<LinkPreview | null> {
    const cached = await this.getCached(url)
    if (cached) return cached

    try {
      let urlObj: URL
      try {
        urlObj = new URL(url)
      } catch {
        return null
      }
      if (!['http:', 'https:'].includes(urlObj.protocol)) return null

      const html = await Promise.race([
        this.fetcher.fetch(url),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), this.timeoutMs))
      ])

      const meta = extractMeta(html)
      const preview: LinkPreview = {
        url,
        title: sanitize(meta['og:title'] || meta['twitter:title'] || meta['title']),
        description: sanitize(meta['og:description'] || meta['twitter:description'] || meta['description']),
        siteName: sanitize(meta['og:site_name']),
        imageUrl: meta['og:image'] || meta['twitter:image'],
        faviconUrl: undefined,
        type: detectType(meta),
        fetchedAt: new Date().toISOString(),
        ttlSeconds: this.defaultTTL
      }

      this.cache.set(url, { preview, expiresAt: Date.now() + this.defaultTTL * 1000 })
      return preview
    } catch {
      return null
    }
  }
}
