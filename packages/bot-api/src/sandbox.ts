import type { BotSandbox, ResourceUsage } from './bot-host.js'

interface BotTracker {
  sandbox: BotSandbox
  messageTimestamps: number[]
  apiCallTimestamps: number[]
  memoryUsage: number
  cpuUsage: number
}

export class SandboxEnforcer {
  private trackers = new Map<string, BotTracker>()
  private windowMs = 60000 // 1 minute window

  registerBot(botDID: string, sandbox: BotSandbox): void {
    this.trackers.set(botDID, {
      sandbox,
      messageTimestamps: [],
      apiCallTimestamps: [],
      memoryUsage: 0,
      cpuUsage: 0
    })
  }

  unregisterBot(botDID: string): void {
    this.trackers.delete(botDID)
  }

  trackMessage(botDID: string): void {
    const tracker = this.trackers.get(botDID)
    if (!tracker) return

    this.cleanTimestamps(tracker.messageTimestamps)
    if (tracker.messageTimestamps.length >= tracker.sandbox.maxMessagesPerMinute) {
      throw new Error('Rate limit exceeded: too many messages')
    }
    tracker.messageTimestamps.push(Date.now())
  }

  trackApiCall(botDID: string): void {
    const tracker = this.trackers.get(botDID)
    if (!tracker) return

    this.cleanTimestamps(tracker.apiCallTimestamps)
    if (tracker.apiCallTimestamps.length >= tracker.sandbox.maxApiCallsPerMinute) {
      throw new Error('Rate limit exceeded: too many API calls')
    }
    tracker.apiCallTimestamps.push(Date.now())
  }

  checkMemory(botDID: string, memoryMB: number): boolean {
    const tracker = this.trackers.get(botDID)
    if (!tracker) return true
    tracker.memoryUsage = memoryMB
    return memoryMB <= tracker.sandbox.memoryLimitMB
  }

  checkCpu(botDID: string, cpuPercent: number): boolean {
    const tracker = this.trackers.get(botDID)
    if (!tracker) return true
    tracker.cpuUsage = cpuPercent
    return cpuPercent <= tracker.sandbox.cpuPercent
  }

  checkNetworkAccess(botDID: string, host?: string): boolean {
    const tracker = this.trackers.get(botDID)
    if (!tracker) return false

    if (!tracker.sandbox.networkAccess) return false
    if (!host) return true
    if (!tracker.sandbox.allowedHosts) return true

    return tracker.sandbox.allowedHosts.includes(host)
  }

  getResourceUsage(botDID: string): ResourceUsage {
    const tracker = this.trackers.get(botDID)
    if (!tracker) return { memoryMB: 0, cpuPercent: 0, messagesPerMinute: 0, apiCallsPerMinute: 0 }

    this.cleanTimestamps(tracker.messageTimestamps)
    this.cleanTimestamps(tracker.apiCallTimestamps)

    return {
      memoryMB: tracker.memoryUsage,
      cpuPercent: tracker.cpuUsage,
      messagesPerMinute: tracker.messageTimestamps.length,
      apiCallsPerMinute: tracker.apiCallTimestamps.length
    }
  }

  private cleanTimestamps(timestamps: number[]): void {
    const cutoff = Date.now() - this.windowMs
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift()
    }
  }
}
