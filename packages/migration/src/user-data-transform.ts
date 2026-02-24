// Transform parsed Discord data export into Harmony quads
import type { Quad } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import type { DiscordDataPackage } from './discord-export-parser.js'

/**
 * Transform a parsed Discord personal data export into quads.
 * All data is placed in a graph scoped to the user's DID, marking ownership.
 */
export function transformDiscordExportToQuads(data: DiscordDataPackage, ownerDID: string): Quad[] {
  const quads: Quad[] = []
  const g = `harmony:claimed:${ownerDID}`
  const userURI = `harmony:user:${data.account.id}`

  // User identity
  quads.push({ subject: userURI, predicate: RDFPredicate.type, object: HarmonyType.Member, graph: g })
  quads.push({ subject: userURI, predicate: HarmonyPredicate.name, object: { value: data.account.username }, graph: g })
  quads.push({ subject: userURI, predicate: HarmonyPredicate.discordId, object: { value: data.account.id }, graph: g })
  quads.push({
    subject: userURI,
    predicate: HarmonyPredicate.discordUsername,
    object: { value: data.account.username },
    graph: g
  })
  quads.push({ subject: userURI, predicate: HarmonyPredicate.did, object: { value: ownerDID }, graph: g })

  if (data.account.email) {
    quads.push({
      subject: userURI,
      predicate: `${HarmonyPredicate.name}Email`,
      object: { value: data.account.email },
      graph: g
    })
  }

  // Servers the user was in
  for (const server of data.servers) {
    const serverURI = `harmony:community:${server.id}`
    quads.push({ subject: serverURI, predicate: RDFPredicate.type, object: HarmonyType.Community, graph: g })
    quads.push({ subject: serverURI, predicate: HarmonyPredicate.name, object: { value: server.name }, graph: g })
    quads.push({ subject: userURI, predicate: HarmonyPredicate.community, object: serverURI, graph: g })
  }

  // Messages
  for (const channel of data.messages) {
    const channelURI = `harmony:channel:${channel.channelId}`
    quads.push({ subject: channelURI, predicate: RDFPredicate.type, object: HarmonyType.Channel, graph: g })
    if (channel.channelName) {
      quads.push({
        subject: channelURI,
        predicate: HarmonyPredicate.name,
        object: { value: channel.channelName },
        graph: g
      })
    }

    for (const msg of channel.messages) {
      const msgURI = `harmony:message:${msg.id}`
      quads.push({ subject: msgURI, predicate: RDFPredicate.type, object: HarmonyType.Message, graph: g })
      quads.push({ subject: msgURI, predicate: HarmonyPredicate.content, object: { value: msg.content }, graph: g })
      quads.push({
        subject: msgURI,
        predicate: HarmonyPredicate.timestamp,
        object: { value: msg.timestamp, datatype: XSDDatatype.dateTime },
        graph: g
      })
      quads.push({ subject: msgURI, predicate: HarmonyPredicate.author, object: userURI, graph: g })
      quads.push({ subject: msgURI, predicate: HarmonyPredicate.inChannel, object: channelURI, graph: g })
    }
  }

  return quads
}

/**
 * Compute metadata summary from a parsed Discord data package.
 */
export function computeDataMeta(data: DiscordDataPackage): {
  messageCount: number
  channelCount: number
  serverCount: number
  dateRange: { earliest: string; latest: string } | null
} {
  let messageCount = 0
  let earliest = ''
  let latest = ''

  for (const channel of data.messages) {
    messageCount += channel.messages.length
    for (const msg of channel.messages) {
      if (msg.timestamp) {
        if (!earliest || msg.timestamp < earliest) earliest = msg.timestamp
        if (!latest || msg.timestamp > latest) latest = msg.timestamp
      }
    }
  }

  return {
    messageCount,
    channelCount: data.messages.length,
    serverCount: data.servers.length,
    dateRange: earliest ? { earliest, latest } : null
  }
}
