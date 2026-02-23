import type { BotEvent, BotEventType, RegisteredBot } from './bot-host.js'
import type { ZCAPBotAuth } from './zcap-bot-auth.js'

export class EventDispatcher {
  private bots = new Map<string, RegisteredBot>()
  private auth: ZCAPBotAuth
  private eventQueue = new Map<string, BotEvent[]>()
  private dispatchers = new Map<string, (event: BotEvent) => Promise<void>>()

  constructor(auth: ZCAPBotAuth) {
    this.auth = auth
  }

  registerBot(bot: RegisteredBot, dispatcher: (event: BotEvent) => Promise<void>): void {
    this.bots.set(bot.id, bot)
    this.dispatchers.set(bot.id, dispatcher)
  }

  unregisterBot(botId: string): void {
    this.bots.delete(botId)
    this.dispatchers.delete(botId)
    this.eventQueue.delete(botId)
  }

  async dispatchEvent(event: BotEvent): Promise<void> {
    for (const [botId, bot] of this.bots) {
      // Only dispatch if bot subscribes to this event type
      if (!bot.manifest.events.includes(event.type)) continue

      // Only dispatch if bot is running
      if (bot.status !== 'running') {
        // Queue event for replay
        if (!this.eventQueue.has(botId)) {
          this.eventQueue.set(botId, [])
        }
        this.eventQueue.get(botId)!.push(event)
        continue
      }

      // Check channel access
      if (event.channelId && !this.auth.canAccessChannel(bot.manifest.did, event.channelId)) {
        continue
      }

      const dispatcher = this.dispatchers.get(botId)
      if (dispatcher) {
        await dispatcher(event)
      }
    }
  }

  async replayMissedEvents(botId: string): Promise<void> {
    const queued = this.eventQueue.get(botId) ?? []
    const dispatcher = this.dispatchers.get(botId)
    if (dispatcher) {
      for (const event of queued) {
        await dispatcher(event)
      }
    }
    this.eventQueue.delete(botId)
  }
}
