export interface SharedContent {
  text?: string
  url?: string
  files?: SharedFile[]
}

export interface SharedFile {
  name: string
  type: string
  uri: string
  size: number
}

export interface ShareTarget {
  register(): Promise<void>
  onShareReceived(cb: (share: SharedContent) => void): void
}

export class InMemoryShareTarget implements ShareTarget {
  private registered = false
  private handlers: ((share: SharedContent) => void)[] = []

  async register(): Promise<void> {
    this.registered = true
  }

  onShareReceived(cb: (share: SharedContent) => void): void {
    this.handlers.push(cb)
  }

  isRegistered(): boolean {
    return this.registered
  }

  // Test helper
  simulateShare(share: SharedContent): void {
    for (const h of this.handlers) h(share)
  }
}
