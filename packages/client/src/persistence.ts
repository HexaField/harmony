// ── Persistence ──

export interface PersistenceAdapter {
  load(): Promise<PersistedState>
  save(state: PersistedState): Promise<void>
}

export interface PersistedState {
  servers: Array<{ url: string; communityIds: string[] }>
  did?: string
  encryptionKeyPair?: { publicKey: number[]; secretKey: number[] }
  // Extended state (Priority 2)
  communityServerMap?: Record<string, string>
  lastActiveCommunityId?: string
  lastActiveChannelId?: string
  mlsGroupStates?: Record<string, number[]> // groupId -> exportState() bytes
  sessionTokens?: Record<string, string> // serverUrl -> token
  recoveryConfig?: {
    trustedDIDs: string[]
    threshold: number
    configuredBy: string
    configuredAt: string
  }
}

export class LocalStoragePersistence implements PersistenceAdapter {
  private key = 'harmony:client:state'

  async load(): Promise<PersistedState> {
    try {
      const raw = localStorage.getItem(this.key)
      if (raw) return JSON.parse(raw) as PersistedState
    } catch {
      /* ignore */
    }
    return { servers: [] }
  }

  async save(state: PersistedState): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }
}

// ── KV Persistence ──

export interface KVPersistenceAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
}

export class MemoryKVPersistence implements KVPersistenceAdapter {
  private store = new Map<string, string>()
  async get(key: string) {
    return this.store.get(key) ?? null
  }
  async set(key: string, value: string) {
    this.store.set(key, value)
  }
  async remove(key: string) {
    this.store.delete(key)
  }
  async keys() {
    return Array.from(this.store.keys())
  }
}

export class IndexedDBPersistence implements KVPersistenceAdapter {
  private dbName: string
  private storeName = 'harmony-kv'

  constructor(dbName = 'harmony-persistence') {
    this.dbName = dbName
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private wrap<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async get(key: string): Promise<string | null> {
    const db = await this.open()
    const tx = db.transaction(this.storeName, 'readonly')
    const result = await this.wrap(tx.objectStore(this.storeName).get(key))
    return (result as string) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.open()
    const tx = db.transaction(this.storeName, 'readwrite')
    await this.wrap(tx.objectStore(this.storeName).put(value, key))
  }

  async remove(key: string): Promise<void> {
    const db = await this.open()
    const tx = db.transaction(this.storeName, 'readwrite')
    await this.wrap(tx.objectStore(this.storeName).delete(key))
  }

  async keys(): Promise<string[]> {
    const db = await this.open()
    const tx = db.transaction(this.storeName, 'readonly')
    const result = await this.wrap(tx.objectStore(this.storeName).getAllKeys())
    return result.map((k) => String(k))
  }
}

export class KVBackedPersistence implements PersistenceAdapter {
  readonly kv: KVPersistenceAdapter
  private stateKey: string

  constructor(kv: KVPersistenceAdapter, stateKey = 'harmony:client:state') {
    this.kv = kv
    this.stateKey = stateKey
  }

  async load(): Promise<PersistedState> {
    const raw = await this.kv.get(this.stateKey)
    if (raw) return JSON.parse(raw) as PersistedState
    return { servers: [] }
  }

  async save(state: PersistedState): Promise<void> {
    await this.kv.set(this.stateKey, JSON.stringify(state))
  }
}
