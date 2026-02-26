import type { ShareTarget, SharedContent } from './share-target.js'
import { InMemoryShareTarget } from './share-target.js'

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export class CapacitorShareTarget implements ShareTarget {
  private fallback = new InMemoryShareTarget()
  private native: boolean | null = null
  private handlers: ((share: SharedContent) => void)[] = []

  private async useNative(): Promise<boolean> {
    if (this.native === null) this.native = await isNative()
    return this.native
  }

  async register(): Promise<void> {
    if (!(await this.useNative())) return this.fallback.register()
    try {
      const { App } = await import('@capacitor/app')
      App.addListener('appUrlOpen', (event) => {
        const content: SharedContent = { url: event.url }
        for (const h of this.handlers) h(content)
      })
    } catch {
      /* plugin not available */
    }
  }

  onShareReceived(cb: (share: SharedContent) => void): void {
    this.handlers.push(cb)
    this.useNative().then((native) => {
      if (!native) this.fallback.onShareReceived(cb)
    })
  }
}

export function createShareTarget(): ShareTarget {
  return new CapacitorShareTarget()
}
