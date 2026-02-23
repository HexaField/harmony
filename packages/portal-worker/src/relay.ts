// NAT Relay Durable Object
export interface RelaySession {
  nodeWs: WebSocket | null
  clientWs: WebSocket | null
  nodeDID: string
}

export class RelayDurableObject {
  private sessions: Map<string, RelaySession> = new Map()

  handleNodeConnection(ws: MockWebSocket, nodeDID: string): void {
    this.sessions.set(nodeDID, { nodeWs: ws as unknown as WebSocket, clientWs: null, nodeDID })

    ws.addEventListener('message', (event: MessageEvent | Event) => {
      const session = this.sessions.get(nodeDID)
      if (session?.clientWs && (session.clientWs as unknown as MockWebSocket).readyState === 1) {
        ;(session.clientWs as unknown as MockWebSocket).send((event as MessageEvent).data)
      }
    })

    ws.addEventListener('close', () => {
      const session = this.sessions.get(nodeDID)
      if (session?.clientWs) {
        ;(session.clientWs as unknown as MockWebSocket).close(1001, 'Node disconnected')
      }
      this.sessions.delete(nodeDID)
    })
  }

  handleClientConnection(ws: MockWebSocket, nodeDID: string): void {
    const session = this.sessions.get(nodeDID)
    if (!session) {
      ws.close(4004, 'Node not connected')
      return
    }

    session.clientWs = ws as unknown as WebSocket

    ws.addEventListener('message', (event: MessageEvent | Event) => {
      if (session.nodeWs && (session.nodeWs as unknown as MockWebSocket).readyState === 1) {
        ;(session.nodeWs as unknown as MockWebSocket).send((event as MessageEvent).data)
      }
    })

    ws.addEventListener('close', () => {
      if (session) {
        session.clientWs = null
      }
    })
  }

  getConnectedNodes(): string[] {
    return Array.from(this.sessions.keys())
  }
}

// Mock WebSocket for testing (since we're not running in Workers runtime)
export interface MockWebSocket {
  readyState: number
  send(data: unknown): void
  close(code?: number, reason?: string): void
  addEventListener(event: string, handler: (event: MessageEvent | Event) => void): void
  removeEventListener(event: string, handler: (event: MessageEvent | Event) => void): void
  dispatchEvent(event: MessageEvent | Event): void
}

export function createMockWebSocket(): MockWebSocket {
  const listeners: Map<string, Set<(event: MessageEvent | Event) => void>> = new Map()
  let _readyState = 1

  return {
    get readyState() {
      return _readyState
    },
    send(_data: unknown) {
      // In real impl, this sends over the wire
    },
    close(_code?: number, _reason?: string) {
      _readyState = 3
      const closeHandlers = listeners.get('close')
      if (closeHandlers) {
        for (const handler of closeHandlers) {
          handler(new Event('close'))
        }
      }
    },
    addEventListener(event: string, handler: (event: MessageEvent | Event) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    },
    removeEventListener(event: string, handler: (event: MessageEvent | Event) => void) {
      listeners.get(event)?.delete(handler)
    },
    dispatchEvent(event: MessageEvent | Event) {
      const handlers = listeners.get(event.type)
      if (handlers) {
        for (const handler of handlers) {
          handler(event)
        }
      }
    }
  }
}
