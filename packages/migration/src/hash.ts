// Isomorphic SHA-256 hash computation for migration verification
// Works in both Node.js (crypto) and browsers (WebCrypto)

/**
 * Compute a SHA-256 hash of a Discord message for verification.
 * Format: SHA256(serverId + ":" + channelId + ":" + messageId + ":" + authorId + ":" + timestamp)
 *
 * This is isomorphic — uses Node crypto when available, falls back to WebCrypto.
 */
export async function computeMessageHash(params: {
  serverId: string
  channelId: string
  messageId: string
  authorId: string
  timestamp: string
}): Promise<string> {
  const input = `${params.serverId}:${params.channelId}:${params.messageId}:${params.authorId}:${params.timestamp}`
  const data = new TextEncoder().encode(input)

  // Try Node.js crypto first (faster, synchronous)
  if (typeof globalThis.process !== 'undefined' && typeof globalThis.process.versions?.node === 'string') {
    try {
      const { createHash } = await import('node:crypto')
      return createHash('sha256').update(data).digest('hex')
    } catch {
      // Fall through to WebCrypto
    }
  }

  // WebCrypto (browser + Deno + CF Workers)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Build a hash index from a set of messages for a given server.
 * Returns a Map of hash → { channelId, messageId } for lookup.
 */
export async function buildHashIndex(
  serverId: string,
  messages: Map<string, Array<{ id: string; channelId: string; author: { id: string }; timestamp: string }>>
): Promise<Map<string, { channelId: string; messageId: string }>> {
  const index = new Map<string, { channelId: string; messageId: string }>()

  for (const [channelId, channelMessages] of messages) {
    for (const msg of channelMessages) {
      const hash = await computeMessageHash({
        serverId,
        channelId,
        messageId: msg.id,
        authorId: msg.author.id,
        timestamp: msg.timestamp
      })
      index.set(hash, { channelId, messageId: msg.id })
    }
  }

  return index
}

/**
 * Verify user-submitted hashes against a stored hash index.
 * Returns the set of verified hashes (intersection of user hashes and stored index).
 */
export function verifyUserHashes(
  userHashes: string[],
  storedIndex: Set<string>
): { verified: string[]; rejected: string[] } {
  const verified: string[] = []
  const rejected: string[] = []

  for (const hash of userHashes) {
    if (storedIndex.has(hash)) {
      verified.push(hash)
    } else {
      rejected.push(hash)
    }
  }

  return { verified, rejected }
}
