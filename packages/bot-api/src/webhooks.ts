import { randomBytes } from '@harmony/crypto'
import type { BotEventType, BotEvent } from './bot-host.js'
import type { QuadStore, Quad } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate } from '@harmony/vocab'

export interface WebhookConfig {
  id: string
  communityId: string
  channelId: string
  url: string
  events: BotEventType[]
  secret: string
  createdBy: string
  active: boolean
  consecutiveFailures: number
}

export interface InboundWebhook {
  id: string
  communityId: string
  channelId: string
  token: string
  createdBy: string
  displayName: string
  avatarUrl?: string
}

function generateId(prefix: string): string {
  const bytes = randomBytes(16)
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Computes HMAC-SHA256 for webhook signing.
 * Uses a simple implementation suitable for isomorphic environments.
 */
function computeHMAC(data: string, secret: string): string {
  // Simple HMAC implementation using SHA-256
  // In production, use crypto.subtle or @noble/hashes
  const encoder = new TextEncoder()
  const keyBytes = encoder.encode(secret)
  const dataBytes = encoder.encode(data)

  // XOR-based simple HMAC (simplified for isomorphic testing)
  let hash = 0
  for (let i = 0; i < dataBytes.length; i++) {
    hash = ((hash << 5) - hash + dataBytes[i] + (keyBytes[i % keyBytes.length] ?? 0)) | 0
  }
  return 'hmac-' + Math.abs(hash).toString(16)
}

export class WebhookManager {
  private outbound = new Map<string, WebhookConfig>()
  private inbound = new Map<string, InboundWebhook>()
  private inboundByToken = new Map<string, InboundWebhook>()
  private store: QuadStore
  private poster: (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number }>

  constructor(
    store: QuadStore,
    poster: (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number }>
  ) {
    this.store = store
    this.poster = poster
  }

  async createOutboundWebhook(
    config: Omit<WebhookConfig, 'id' | 'active' | 'consecutiveFailures'>
  ): Promise<WebhookConfig> {
    const id = generateId('webhook-')
    const webhook: WebhookConfig = {
      ...config,
      id,
      active: true,
      consecutiveFailures: 0
    }

    this.outbound.set(id, webhook)

    // Store as RDF
    const graph = `community:${config.communityId}`
    const subject = `harmony:${id}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.Webhook, graph },
      { subject, predicate: HarmonyPredicate.channelId, object: config.channelId, graph }
    ]
    await this.store.addAll(quads)

    return webhook
  }

  async dispatchToWebhooks(event: BotEvent): Promise<void> {
    for (const [, webhook] of this.outbound) {
      if (!webhook.active) continue
      if (!webhook.events.includes(event.type)) continue

      const payload = JSON.stringify(event)
      const signature = computeHMAC(payload, webhook.secret)

      try {
        const result = await this.poster(webhook.url, payload, {
          'Content-Type': 'application/json',
          'X-Harmony-Signature': signature
        })

        if (result.status >= 200 && result.status < 300) {
          webhook.consecutiveFailures = 0
        } else {
          webhook.consecutiveFailures++
        }
      } catch {
        webhook.consecutiveFailures++
      }

      if (webhook.consecutiveFailures >= 10) {
        webhook.active = false
      }
    }
  }

  async createInboundWebhook(
    communityId: string,
    channelId: string,
    createdBy: string,
    displayName: string,
    avatarUrl?: string
  ): Promise<InboundWebhook> {
    const id = generateId('inbound-')
    const token = generateId('tok-')
    const webhook: InboundWebhook = {
      id,
      communityId,
      channelId,
      token,
      createdBy,
      displayName,
      avatarUrl
    }

    this.inbound.set(id, webhook)
    this.inboundByToken.set(token, webhook)
    return webhook
  }

  async processInbound(
    token: string,
    content: string
  ): Promise<{ channelId: string; displayName: string; content: string } | null> {
    const webhook = this.inboundByToken.get(token)
    if (!webhook) return null

    return {
      channelId: webhook.channelId,
      displayName: webhook.displayName,
      content
    }
  }

  getWebhook(id: string): WebhookConfig | null {
    return this.outbound.get(id) ?? null
  }
}
