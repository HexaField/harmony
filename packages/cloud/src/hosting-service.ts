import type { CryptoProvider, EncryptedPayload } from '@harmony/crypto'
import { fork, type ChildProcess } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

export interface ManagedInstance {
  id: string
  name: string
  ownerDID: string
  createdAt: string
  status: 'active' | 'suspended' | 'deleted'
  memberCount: number
  storageUsedBytes: number
  maxStorageBytes: number
  serverUrl?: string
  httpUrl?: string
}

interface RunningServer {
  process: ChildProcess
  port: number
  wsUrl: string
  httpUrl: string
}

export interface StoredBlob {
  id: string
  instanceId: string
  uploaderDID: string
  encrypted: EncryptedPayload
  createdAt: string
  sizeBytes: number
}

// ── Cloud Adapter Interface ──

export interface CloudAdapter {
  createInstance(name: string, ownerDID: string): Promise<{ serverUrl: string; instanceId: string }>
  deleteInstance(id: string): Promise<void>
  getHealth(id: string): Promise<{ healthy: boolean; connections: number }>
}

// ── Cloudflare Adapter ──

export class CloudflareAdapter implements CloudAdapter {
  private workerUrl: string
  private apiToken: string

  constructor(workerUrl: string, apiToken: string) {
    this.workerUrl = workerUrl
    this.apiToken = apiToken
  }

  async createInstance(name: string, ownerDID: string): Promise<{ serverUrl: string; instanceId: string }> {
    const res = await fetch(`${this.workerUrl}/api/instances`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ownerDID })
    })
    if (!res.ok) throw new Error(`Failed to create instance: ${res.statusText}`)
    const data = (await res.json()) as { id: string; serverUrl: string }
    return { serverUrl: `${this.workerUrl}${data.serverUrl}`, instanceId: data.id }
  }

  async deleteInstance(id: string): Promise<void> {
    const res = await fetch(`${this.workerUrl}/api/instances/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiToken}` }
    })
    if (!res.ok) throw new Error(`Failed to delete instance: ${res.statusText}`)
  }

  async getHealth(id: string): Promise<{ healthy: boolean; connections: number }> {
    try {
      const res = await fetch(`${this.workerUrl}/api/instances/${id}/health`, {
        headers: { Authorization: `Bearer ${this.apiToken}` }
      })
      if (res.ok) {
        const data = (await res.json()) as { status: string; connections: number }
        return { healthy: data.status === 'ok', connections: data.connections }
      }
    } catch {
      // not reachable
    }
    return { healthy: false, connections: 0 }
  }
}

// ── Hosting Service ──

export type HostingMode = 'local' | 'cloudflare'

export interface CloudflareConfig {
  workerUrl: string
  apiToken: string
}

export class HostingService {
  private instances: Map<string, ManagedInstance> = new Map()
  private storage: Map<string, StoredBlob> = new Map() // blobId → blob
  private instanceBlobs: Map<string, Set<string>> = new Map() // instanceId → blobIds
  private maxInstancesPerUser: number
  private defaultMaxStorageBytes: number
  private _runningServers: Map<string, RunningServer> = new Map()
  private _nextPort: number
  private _dataDir: string
  private _serverRuntimePath: string
  private _host: string
  private _mode: HostingMode
  private _cloudAdapter: CloudflareAdapter | null = null

  constructor(
    _crypto: CryptoProvider,
    options?: {
      maxInstancesPerUser?: number
      defaultMaxStorageBytes?: number
      basePort?: number
      dataDir?: string
      host?: string
      mode?: HostingMode
      cloudflare?: CloudflareConfig
      serverRuntimePath?: string
    }
  ) {
    this.maxInstancesPerUser = options?.maxInstancesPerUser ?? 5
    this.defaultMaxStorageBytes = options?.defaultMaxStorageBytes ?? 100 * 1024 * 1024 // 100MB
    this._nextPort = options?.basePort ?? 5000
    this._dataDir = options?.dataDir ?? '/tmp/harmony-cloud/instances'
    this._host = options?.host ?? 'localhost'
    this._mode = options?.mode ?? 'local'

    if (this._mode === 'cloudflare' && options?.cloudflare) {
      this._cloudAdapter = new CloudflareAdapter(options.cloudflare.workerUrl, options.cloudflare.apiToken)
    }

    // Resolve path to server-runtime entry point
    if (options?.serverRuntimePath) {
      this._serverRuntimePath = options.serverRuntimePath
    } else {
      const thisDir =
        typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url))
      this._serverRuntimePath = resolve(thisDir, '../../server-runtime/bin/harmony-server.js')
    }
  }

  async createInstance(params: { name: string; ownerDID: string }): Promise<ManagedInstance> {
    // Check quota
    const owned = this.listInstances(params.ownerDID)
    if (owned.length >= this.maxInstancesPerUser) {
      throw new Error('Instance quota exceeded')
    }

    const id = 'inst_' + Array.from({ length: 12 }, () => Math.random().toString(36)[2]).join('')
    const instance: ManagedInstance = {
      id,
      name: params.name,
      ownerDID: params.ownerDID,
      createdAt: new Date().toISOString(),
      status: 'active',
      memberCount: 0,
      storageUsedBytes: 0,
      maxStorageBytes: this.defaultMaxStorageBytes
    }

    if (this._mode === 'cloudflare' && this._cloudAdapter) {
      // Provision via Cloudflare Workers
      try {
        const result = await this._cloudAdapter.createInstance(params.name, params.ownerDID)
        instance.serverUrl = result.serverUrl
      } catch {
        // Cloudflare provisioning failed — instance created without server URL
      }
    } else {
      // Try to provision a real server-runtime process (local mode)
      try {
        await this._spawnServer(id, instance)
      } catch {
        // server-runtime not available — instance created without server URL
      }
    }

    this.instances.set(id, instance)
    this.instanceBlobs.set(id, new Set())
    return instance
  }

  private async _spawnServer(id: string, instance: ManagedInstance): Promise<void> {
    const port = this._nextPort++
    const healthPort = port + 1
    const instanceDataDir = resolve(this._dataDir, id)
    mkdirSync(instanceDataDir, { recursive: true })

    // Resolve tsx from the monorepo root so fork() finds it regardless of cwd
    const monorepoRoot = resolve(this._serverRuntimePath, '..', '..', '..', '..')
    const tsxPath = resolve(monorepoRoot, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs')

    let child: ChildProcess
    try {
      child = fork(this._serverRuntimePath, [], {
        execArgv: ['--import', tsxPath],
        env: {
          ...process.env,
          HARMONY_PORT: String(port),
          HARMONY_HOST: '0.0.0.0',
          HARMONY_DB_PATH: resolve(instanceDataDir, 'harmony.db'),
          HARMONY_MEDIA_PATH: resolve(instanceDataDir, 'media')
        },
        cwd: monorepoRoot,
        stdio: 'pipe'
      })
    } catch {
      throw new Error('Failed to spawn server-runtime')
    }

    const wsUrl = `ws://${this._host}:${port}`
    const httpUrl = `http://${this._host}:${healthPort}`

    // Race health check against early process exit
    const exitPromise = new Promise<never>((_, reject) => {
      child.on('error', () => reject(new Error('Server process error')))
      child.on('exit', () => reject(new Error('Server process exited early')))
    })

    await Promise.race([this._waitForHealth(httpUrl, 10000), exitPromise])

    this._runningServers.set(id, { process: child, port, wsUrl, httpUrl })
    instance.serverUrl = wsUrl
    instance.httpUrl = httpUrl
  }

  private async _waitForHealth(httpUrl: string, timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${httpUrl}/health`)
        if (res.ok) return
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error('Server health check timed out')
  }

  getServerUrl(id: string): string | null {
    return this._runningServers.get(id)?.wsUrl ?? null
  }

  async restartInstance(id: string): Promise<void> {
    const inst = this.instances.get(id)
    if (!inst) throw new Error('Instance not found')
    this._killServer(id)
    await this._spawnServer(id, inst)
  }

  async getInstanceHealth(id: string): Promise<{ healthy: boolean; connections: number; uptime: number }> {
    const server = this._runningServers.get(id)
    if (!server) return { healthy: false, connections: 0, uptime: 0 }
    try {
      const res = await fetch(`${server.httpUrl}/health`)
      if (res.ok) {
        const data = (await res.json()) as any
        return {
          healthy: true,
          connections: data.connections ?? 0,
          uptime: data.uptime ?? 0
        }
      }
    } catch {
      // not reachable
    }
    return { healthy: false, connections: 0, uptime: 0 }
  }

  private _killServer(id: string): void {
    const server = this._runningServers.get(id)
    if (server) {
      server.process.kill()
      this._runningServers.delete(id)
    }
  }

  getInstance(id: string): ManagedInstance | null {
    return this.instances.get(id) ?? null
  }

  listInstances(ownerDID: string): ManagedInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.ownerDID === ownerDID && i.status !== 'deleted')
  }

  async deleteInstance(id: string, requesterDID: string): Promise<void> {
    const inst = this.instances.get(id)
    if (!inst) throw new Error('Instance not found')
    if (inst.ownerDID !== requesterDID) throw new Error('Unauthorized')
    inst.status = 'deleted'
    inst.serverUrl = undefined
    inst.httpUrl = undefined
    this._killServer(id)

    // Clean up blobs
    const blobIds = this.instanceBlobs.get(id)
    if (blobIds) {
      for (const blobId of blobIds) this.storage.delete(blobId)
      this.instanceBlobs.delete(id)
    }
  }

  async suspendInstance(id: string): Promise<void> {
    const inst = this.instances.get(id)
    if (!inst) throw new Error('Instance not found')
    inst.status = 'suspended'
    inst.serverUrl = undefined
    inst.httpUrl = undefined
    this._killServer(id)
  }

  async uploadBlob(params: { instanceId: string; uploaderDID: string; data: EncryptedPayload }): Promise<StoredBlob> {
    const inst = this.instances.get(params.instanceId)
    if (!inst) throw new Error('Instance not found')
    if (inst.status !== 'active') throw new Error('Instance is not active')

    const sizeBytes = params.data.ciphertext.length + params.data.nonce.length
    if (inst.storageUsedBytes + sizeBytes > inst.maxStorageBytes) {
      throw new Error('Storage quota exceeded')
    }

    const blobId = 'blob_' + Array.from({ length: 12 }, () => Math.random().toString(36)[2]).join('')
    const blob: StoredBlob = {
      id: blobId,
      instanceId: params.instanceId,
      uploaderDID: params.uploaderDID,
      encrypted: params.data,
      createdAt: new Date().toISOString(),
      sizeBytes
    }

    this.storage.set(blobId, blob)
    this.instanceBlobs.get(params.instanceId)!.add(blobId)
    inst.storageUsedBytes += sizeBytes

    return blob
  }

  getBlob(blobId: string): StoredBlob | null {
    return this.storage.get(blobId) ?? null
  }

  async deleteBlob(blobId: string, requesterDID: string): Promise<void> {
    const blob = this.storage.get(blobId)
    if (!blob) throw new Error('Blob not found')

    const inst = this.instances.get(blob.instanceId)
    if (!inst) throw new Error('Instance not found')
    if (inst.ownerDID !== requesterDID && blob.uploaderDID !== requesterDID) {
      throw new Error('Unauthorized')
    }

    inst.storageUsedBytes -= blob.sizeBytes
    this.storage.delete(blobId)
    this.instanceBlobs.get(blob.instanceId)?.delete(blobId)
  }

  listBlobs(instanceId: string): StoredBlob[] {
    const blobIds = this.instanceBlobs.get(instanceId)
    if (!blobIds) return []
    return Array.from(blobIds)
      .map((id) => this.storage.get(id)!)
      .filter(Boolean)
  }
}
