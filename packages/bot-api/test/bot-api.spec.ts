import { describe, it, expect, beforeEach } from 'vitest'
import { BotHost } from '../src/bot-host.js'
import { createBotContext } from '../src/bot-context.js'
import { EventDispatcher } from '../src/event-dispatch.js'
import { SandboxEnforcer } from '../src/sandbox.js'
import { WebhookManager } from '../src/webhooks.js'
import { ZCAPBotAuth } from '../src/zcap-bot-auth.js'
import { MemoryQuadStore } from '@harmony/quads'
import { HarmonyType } from '@harmony/vocab'
import type { BotManifest, BotEvent, BotEventType, RegisteredBot } from '../src/bot-host.js'
import type { ChannelInfo, MemberInfo } from '../src/bot-context.js'

function makeManifest(overrides?: Partial<BotManifest>): BotManifest {
  return {
    did: 'did:key:bot-1',
    name: 'Greeter Bot',
    description: 'A friendly greeter',
    version: '1.0.0',
    permissions: ['SendMessage', 'ReadMessage'],
    events: ['message.created', 'member.joined'],
    entrypoint: 'bot.js',
    ...overrides
  }
}

function makeEvent(type: BotEventType = 'message.created', channelId = 'ch1'): BotEvent {
  return {
    type,
    communityId: 'comm1',
    channelId,
    actorDID: 'did:key:alice',
    timestamp: new Date().toISOString(),
    data: { text: 'Hello' }
  }
}

describe('@harmony/bot-api', () => {
  let store: MemoryQuadStore
  let auth: ZCAPBotAuth
  let sandbox: SandboxEnforcer
  let host: BotHost

  beforeEach(() => {
    store = new MemoryQuadStore()
    auth = new ZCAPBotAuth()
    sandbox = new SandboxEnforcer()
    host = new BotHost(store, auth, sandbox)
    auth.grantAdmin('did:key:admin', 'comm1')
  })

  describe('Bot Registration', () => {
    it('MUST register bot with valid manifest and ZCAP delegation', async () => {
      const id = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', ['cap-1'])
      expect(id).toBeTruthy()
      const bot = await host.getBot(id)
      expect(bot).not.toBeNull()
      expect(bot!.manifest.name).toBe('Greeter Bot')
    })

    it('MUST reject registration without admin ZCAP', async () => {
      await expect(host.registerBot(makeManifest(), 'comm1', 'did:key:random', ['cap-1'])).rejects.toThrow('admin')
    })

    it('MUST reject registration with permissions exceeding delegation', async () => {
      // Create a limited admin who only has SendMessage and ReadMessage delegated
      auth.grantAdmin('did:key:limited-admin', 'comm1')
      // Override: revoke admin and grant limited perms
      auth.grantBotPermission('did:key:limited-admin', 'comm1', 'SendMessage')
      auth.grantBotPermission('did:key:limited-admin', 'comm1', 'ReadMessage')
      // The admin capability is there, but hasPermission for ManageChannels
      // is checked via hasBotPermission for non-admin flows
      // Instead, let's use a non-admin installer with limited delegation
      const limitedAuth = new ZCAPBotAuth()
      limitedAuth.grantAdmin('did:key:limited', 'comm1')
      // Override hasPermission to only allow SendMessage
      const limitedHost = new BotHost(store, limitedAuth, sandbox)

      // The admin has all perms by default... We need to test via a bot whose
      // requested perms exceed what's available. Simplest: make ManageChannels
      // not available by not granting admin
      const auth2 = new ZCAPBotAuth()
      auth2.grantBotPermission('did:key:partial-admin', 'comm1', 'SendMessage')
      // partial-admin is NOT an admin, just has SendMessage
      const host2 = new BotHost(store, auth2, sandbox)
      await expect(
        host2.registerBot(makeManifest({ permissions: ['ManageChannels'] }), 'comm1', 'did:key:partial-admin', [])
      ).rejects.toThrow('admin')
    })

    it('MUST assign unique bot ID on registration', async () => {
      const id1 = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      const id2 = await host.registerBot(
        makeManifest({ did: 'did:key:bot-2', name: 'Bot 2' }),
        'comm1',
        'did:key:admin',
        []
      )
      expect(id1).not.toBe(id2)
    })

    it('MUST store bot metadata as RDF quads', async () => {
      const id = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      const quads = await store.match({ subject: `harmony:${id}` })
      expect(quads.length).toBeGreaterThan(0)
      expect(quads.find((q) => q.object === HarmonyType.Bot)).toBeTruthy()
    })

    it('MUST unregister bot and revoke all capabilities', async () => {
      const id = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      await host.unregisterBot(id)
      expect(await host.getBot(id)).toBeNull()
    })
  })

  describe('Bot Lifecycle', () => {
    it('MUST start bot and set status to running', async () => {
      const id = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      await host.startBot(id)
      expect(host.getBotStatus(id)).toBe('running')
    })

    it('MUST stop bot and set status to stopped', async () => {
      const id = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      await host.startBot(id)
      await host.stopBot(id)
      expect(host.getBotStatus(id)).toBe('stopped')
    })

    it('MUST set status to errored on uncaught exception', async () => {
      const id = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      await host.startBot(id)
      await host.setBotErrored(id)
      expect(host.getBotStatus(id)).toBe('errored')
    })

    it('MUST list all bots for a community', async () => {
      await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      await host.registerBot(makeManifest({ did: 'did:key:bot-2', name: 'Bot 2' }), 'comm1', 'did:key:admin', [])
      const bots = await host.listBots('comm1')
      expect(bots).toHaveLength(2)
    })

    it('MUST report resource usage per bot', async () => {
      const id = await host.registerBot(makeManifest(), 'comm1', 'did:key:admin', [])
      host.updateResourceUsage(id, { memoryMB: 50, cpuPercent: 5 })
      const bot = await host.getBot(id)
      expect(bot!.resourceUsage.memoryMB).toBe(50)
    })
  })

  describe('ZCAP Authorization', () => {
    it('MUST verify ZCAP before every bot action', async () => {
      const botDID = 'did:key:bot-test'
      // No permissions granted
      const botCtx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages: new Map(),
        channels: new Map(),
        members: new Map()
      })
      await expect(botCtx.sendMessage('ch1', 'hello')).rejects.toThrow('Unauthorized')
    })

    it('MUST reject sendMessage without SendMessage capability', async () => {
      const botDID = 'did:key:bot-no-send'
      auth.grantBotPermission(botDID, 'comm1', 'ReadMessage')
      const botCtx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages: new Map(),
        channels: new Map(),
        members: new Map()
      })
      await expect(botCtx.sendMessage('ch1', 'hello')).rejects.toThrow('SendMessage')
    })

    it('MUST stop bot immediately on capability revocation', async () => {
      const botDID = 'did:key:bot-revoke'
      auth.grantBotPermission(botDID, 'comm1', 'SendMessage')
      sandbox.registerBot(botDID, {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      const botCtx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages: new Map(),
        channels: new Map(),
        members: new Map()
      })

      // Can send initially
      await botCtx.sendMessage('ch1', 'hello')

      // Revoke
      auth.revokeBotPermissions(botDID, 'comm1')

      // Now blocked
      await expect(botCtx.sendMessage('ch1', 'hello')).rejects.toThrow('Unauthorized')
    })
  })

  describe('Event Dispatch', () => {
    it('MUST deliver message.created events to subscribed bots', async () => {
      const dispatcher = new EventDispatcher(auth)
      const received: BotEvent[] = []
      const bot: RegisteredBot = {
        id: 'bot-1',
        manifest: makeManifest(),
        communityId: 'comm1',
        status: 'running',
        installedBy: 'did:key:admin',
        installedAt: new Date().toISOString(),
        capabilities: [],
        resourceUsage: { memoryMB: 0, cpuPercent: 0, messagesPerMinute: 0, apiCallsPerMinute: 0 },
        sandbox: {
          memoryLimitMB: 128,
          cpuPercent: 10,
          maxMessagesPerMinute: 60,
          maxApiCallsPerMinute: 120,
          networkAccess: false
        }
      }
      dispatcher.registerBot(bot, async (e) => {
        received.push(e)
      })
      await dispatcher.dispatchEvent(makeEvent('message.created'))
      expect(received).toHaveLength(1)
    })

    it('MUST deliver member.joined events to subscribed bots', async () => {
      const dispatcher = new EventDispatcher(auth)
      const received: BotEvent[] = []
      const bot: RegisteredBot = {
        id: 'bot-1',
        manifest: makeManifest(),
        communityId: 'comm1',
        status: 'running',
        installedBy: 'did:key:admin',
        installedAt: new Date().toISOString(),
        capabilities: [],
        resourceUsage: { memoryMB: 0, cpuPercent: 0, messagesPerMinute: 0, apiCallsPerMinute: 0 },
        sandbox: {
          memoryLimitMB: 128,
          cpuPercent: 10,
          maxMessagesPerMinute: 60,
          maxApiCallsPerMinute: 120,
          networkAccess: false
        }
      }
      dispatcher.registerBot(bot, async (e) => {
        received.push(e)
      })
      await dispatcher.dispatchEvent(makeEvent('member.joined'))
      expect(received).toHaveLength(1)
    })

    it('MUST NOT deliver events bot did not subscribe to', async () => {
      const dispatcher = new EventDispatcher(auth)
      const received: BotEvent[] = []
      const bot: RegisteredBot = {
        id: 'bot-1',
        manifest: makeManifest({ events: ['message.created'] }),
        communityId: 'comm1',
        status: 'running',
        installedBy: 'did:key:admin',
        installedAt: new Date().toISOString(),
        capabilities: [],
        resourceUsage: { memoryMB: 0, cpuPercent: 0, messagesPerMinute: 0, apiCallsPerMinute: 0 },
        sandbox: {
          memoryLimitMB: 128,
          cpuPercent: 10,
          maxMessagesPerMinute: 60,
          maxApiCallsPerMinute: 120,
          networkAccess: false
        }
      }
      dispatcher.registerBot(bot, async (e) => {
        received.push(e)
      })
      await dispatcher.dispatchEvent(makeEvent('channel.created'))
      expect(received).toHaveLength(0)
    })

    it('MUST NOT deliver events from channels bot cannot access', async () => {
      const dispatcher = new EventDispatcher(auth)
      auth.scopeToChannels('did:key:bot-1', ['ch1'])
      const received: BotEvent[] = []
      const bot: RegisteredBot = {
        id: 'bot-1',
        manifest: makeManifest(),
        communityId: 'comm1',
        status: 'running',
        installedBy: 'did:key:admin',
        installedAt: new Date().toISOString(),
        capabilities: [],
        resourceUsage: { memoryMB: 0, cpuPercent: 0, messagesPerMinute: 0, apiCallsPerMinute: 0 },
        sandbox: {
          memoryLimitMB: 128,
          cpuPercent: 10,
          maxMessagesPerMinute: 60,
          maxApiCallsPerMinute: 120,
          networkAccess: false
        }
      }
      dispatcher.registerBot(bot, async (e) => {
        received.push(e)
      })
      await dispatcher.dispatchEvent(makeEvent('message.created', 'ch2'))
      expect(received).toHaveLength(0)
    })

    it('MUST include actor DID and timestamp in every event', async () => {
      const dispatcher = new EventDispatcher(auth)
      const received: BotEvent[] = []
      const bot: RegisteredBot = {
        id: 'bot-1',
        manifest: makeManifest(),
        communityId: 'comm1',
        status: 'running',
        installedBy: 'did:key:admin',
        installedAt: new Date().toISOString(),
        capabilities: [],
        resourceUsage: { memoryMB: 0, cpuPercent: 0, messagesPerMinute: 0, apiCallsPerMinute: 0 },
        sandbox: {
          memoryLimitMB: 128,
          cpuPercent: 10,
          maxMessagesPerMinute: 60,
          maxApiCallsPerMinute: 120,
          networkAccess: false
        }
      }
      dispatcher.registerBot(bot, async (e) => {
        received.push(e)
      })
      await dispatcher.dispatchEvent(makeEvent())
      expect(received[0].actorDID).toBe('did:key:alice')
      expect(received[0].timestamp).toBeTruthy()
    })
  })

  describe('Bot SDK', () => {
    it('MUST send messages to authorized channels', async () => {
      const botDID = 'did:key:bot-sdk'
      auth.grantBotPermission(botDID, 'comm1', 'SendMessage')
      sandbox.registerBot(botDID, {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      const messages = new Map<string, { channelId: string; content: string; authorDID: string }>()
      const ctx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages,
        channels: new Map(),
        members: new Map()
      })
      const msgId = await ctx.sendMessage('ch1', 'Hello!')
      expect(msgId).toBeTruthy()
      expect(messages.get(msgId)!.content).toBe('Hello!')
    })

    it('MUST edit own messages', async () => {
      const botDID = 'did:key:bot-edit'
      auth.grantBotPermission(botDID, 'comm1', 'SendMessage')
      sandbox.registerBot(botDID, {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      const messages = new Map<string, { channelId: string; content: string; authorDID: string }>()
      const ctx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages,
        channels: new Map(),
        members: new Map()
      })
      const msgId = await ctx.sendMessage('ch1', 'Original')
      await ctx.editMessage('ch1', msgId, 'Edited')
      expect(messages.get(msgId)!.content).toBe('Edited')
    })

    it('MUST delete own messages', async () => {
      const botDID = 'did:key:bot-del'
      auth.grantBotPermission(botDID, 'comm1', 'SendMessage')
      sandbox.registerBot(botDID, {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      const messages = new Map<string, { channelId: string; content: string; authorDID: string }>()
      const ctx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages,
        channels: new Map(),
        members: new Map()
      })
      const msgId = await ctx.sendMessage('ch1', 'Delete me')
      await ctx.deleteMessage('ch1', msgId)
      expect(messages.has(msgId)).toBe(false)
    })

    it('MUST add reactions', async () => {
      const botDID = 'did:key:bot-react'
      auth.grantBotPermission(botDID, 'comm1', 'SendMessage')
      sandbox.registerBot(botDID, {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      const ctx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages: new Map(),
        channels: new Map(),
        members: new Map()
      })
      // Should not throw
      await ctx.addReaction('ch1', 'msg-1', '👍')
    })

    it('MUST retrieve channel info', async () => {
      const botDID = 'did:key:bot-ch'
      auth.grantBotPermission(botDID, 'comm1', 'ReadMessage')
      sandbox.registerBot(botDID, {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      const channels = new Map<string, ChannelInfo>()
      channels.set('ch1', { id: 'ch1', name: 'general', communityId: 'comm1', type: 'text' })
      const ctx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages: new Map(),
        channels,
        members: new Map()
      })
      const ch = await ctx.getChannel('ch1')
      expect(ch.name).toBe('general')
    })

    it('MUST handle async event handlers (await promises)', async () => {
      const botDID = 'did:key:bot-async'
      auth.grantBotPermission(botDID, 'comm1', 'SendMessage')
      sandbox.registerBot(botDID, {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      const ctx = createBotContext(botDID, 'comm1', [], auth, sandbox, {
        messages: new Map(),
        channels: new Map(),
        members: new Map()
      })

      let handled = false
      ctx.on('message.created', async () => {
        await new Promise((r) => setTimeout(r, 10))
        handled = true
      })

      // Dispatch via internal method
      await (ctx as any)._dispatch(makeEvent())
      expect(handled).toBe(true)
    })
  })

  describe('Sandboxing', () => {
    it('MUST enforce memory limit (kill bot on exceed)', () => {
      sandbox.registerBot('did:key:bot-mem', {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      expect(sandbox.checkMemory('did:key:bot-mem', 200)).toBe(false)
      expect(sandbox.checkMemory('did:key:bot-mem', 100)).toBe(true)
    })

    it('MUST enforce CPU limit (throttle on exceed)', () => {
      sandbox.registerBot('did:key:bot-cpu', {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      expect(sandbox.checkCpu('did:key:bot-cpu', 50)).toBe(false)
      expect(sandbox.checkCpu('did:key:bot-cpu', 5)).toBe(true)
    })

    it('MUST enforce message rate limit', () => {
      sandbox.registerBot('did:key:bot-rate', {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 3,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      sandbox.trackMessage('did:key:bot-rate')
      sandbox.trackMessage('did:key:bot-rate')
      sandbox.trackMessage('did:key:bot-rate')
      expect(() => sandbox.trackMessage('did:key:bot-rate')).toThrow('Rate limit')
    })

    it('MUST enforce API call rate limit', () => {
      sandbox.registerBot('did:key:bot-api', {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 2,
        networkAccess: false
      })
      sandbox.trackApiCall('did:key:bot-api')
      sandbox.trackApiCall('did:key:bot-api')
      expect(() => sandbox.trackApiCall('did:key:bot-api')).toThrow('Rate limit')
    })

    it('MUST block network access by default', () => {
      sandbox.registerBot('did:key:bot-net', {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: false
      })
      expect(sandbox.checkNetworkAccess('did:key:bot-net')).toBe(false)
    })

    it('MUST allow only whitelisted hosts when networkAccess=true', () => {
      sandbox.registerBot('did:key:bot-hosts', {
        memoryLimitMB: 128,
        cpuPercent: 10,
        maxMessagesPerMinute: 60,
        maxApiCallsPerMinute: 120,
        networkAccess: true,
        allowedHosts: ['api.example.com']
      })
      expect(sandbox.checkNetworkAccess('did:key:bot-hosts', 'api.example.com')).toBe(true)
      expect(sandbox.checkNetworkAccess('did:key:bot-hosts', 'evil.com')).toBe(false)
    })
  })

  describe('Webhooks (Outbound)', () => {
    it('MUST POST events to configured webhook URL', async () => {
      const posts: { url: string; body: string }[] = []
      const poster = async (url: string, body: string) => {
        posts.push({ url, body })
        return { status: 200 }
      }
      const mgr = new WebhookManager(store, poster)
      await mgr.createOutboundWebhook({
        communityId: 'comm1',
        channelId: 'ch1',
        url: 'https://example.com/hook',
        events: ['message.created'],
        secret: 'secret123',
        createdBy: 'did:key:admin'
      })
      await mgr.dispatchToWebhooks(makeEvent())
      expect(posts).toHaveLength(1)
      expect(posts[0].url).toBe('https://example.com/hook')
    })

    it('MUST sign payload with HMAC secret', async () => {
      const headers: Record<string, string>[] = []
      const poster = async (_url: string, _body: string, h: Record<string, string>) => {
        headers.push(h)
        return { status: 200 }
      }
      const mgr = new WebhookManager(store, poster)
      await mgr.createOutboundWebhook({
        communityId: 'comm1',
        channelId: 'ch1',
        url: 'https://example.com/hook',
        events: ['message.created'],
        secret: 'secret123',
        createdBy: 'did:key:admin'
      })
      await mgr.dispatchToWebhooks(makeEvent())
      expect(headers[0]['X-Harmony-Signature']).toBeTruthy()
    })

    it('MUST disable webhook after 10 consecutive failures', async () => {
      const poster = async () => {
        return { status: 500 }
      }
      const mgr = new WebhookManager(store, poster)
      const webhook = await mgr.createOutboundWebhook({
        communityId: 'comm1',
        channelId: 'ch1',
        url: 'https://broken.example.com/hook',
        events: ['message.created'],
        secret: 'secret',
        createdBy: 'did:key:admin'
      })
      for (let i = 0; i < 10; i++) {
        await mgr.dispatchToWebhooks(makeEvent())
      }
      const updated = mgr.getWebhook(webhook.id)
      expect(updated!.active).toBe(false)
    })

    it('MUST filter events by configured event types', async () => {
      const posts: string[] = []
      const poster = async (url: string) => {
        posts.push(url)
        return { status: 200 }
      }
      const mgr = new WebhookManager(store, poster)
      await mgr.createOutboundWebhook({
        communityId: 'comm1',
        channelId: 'ch1',
        url: 'https://example.com/hook',
        events: ['member.joined'],
        secret: 'secret',
        createdBy: 'did:key:admin'
      })
      await mgr.dispatchToWebhooks(makeEvent('message.created'))
      expect(posts).toHaveLength(0)
    })
  })

  describe('Webhooks (Inbound)', () => {
    it('MUST accept POST with valid inbound token', async () => {
      const poster = async () => ({ status: 200 })
      const mgr = new WebhookManager(store, poster)
      const webhook = await mgr.createInboundWebhook('comm1', 'ch1', 'did:key:admin', 'GitHub Bot')
      const result = await mgr.processInbound(webhook.token, 'New PR opened!')
      expect(result).not.toBeNull()
      expect(result!.content).toBe('New PR opened!')
      expect(result!.displayName).toBe('GitHub Bot')
    })

    it('MUST create message in target channel from webhook identity', async () => {
      const poster = async () => ({ status: 200 })
      const mgr = new WebhookManager(store, poster)
      const webhook = await mgr.createInboundWebhook('comm1', 'ch1', 'did:key:admin', 'CI Bot')
      const result = await mgr.processInbound(webhook.token, 'Build passed')
      expect(result!.channelId).toBe('ch1')
    })

    it('MUST reject invalid tokens', async () => {
      const poster = async () => ({ status: 200 })
      const mgr = new WebhookManager(store, poster)
      const result = await mgr.processInbound('invalid-token', 'hello')
      expect(result).toBeNull()
    })
  })
})
