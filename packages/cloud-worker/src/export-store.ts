// R2 Export Store implementation
import type { R2Bucket, EncryptedExportBundle, ExportMetadata } from './types.js'
import type { D1Database } from './types.js'

export interface R2ExportStore {
  upload(bundle: EncryptedExportBundle): Promise<{ exportId: string }>
  download(exportId: string): Promise<EncryptedExportBundle | null>
  delete(exportId: string): Promise<void>
  listByAdmin(adminDID: string): Promise<ExportMetadata[]>
}

export function createExportStore(r2: R2Bucket, db: D1Database): R2ExportStore {
  return {
    async upload(bundle: EncryptedExportBundle): Promise<{ exportId: string }> {
      const exportId = 'exp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8)

      // Store bundle in R2
      const data = JSON.stringify({
        ciphertext: Array.from(bundle.ciphertext),
        nonce: Array.from(bundle.nonce),
        metadata: bundle.metadata
      })
      await r2.put(exportId, data)

      // Store metadata in D1
      await db
        .prepare(
          'INSERT INTO export_metadata (export_id, admin_did, community_name, quad_count, size_bytes) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(
          exportId,
          bundle.metadata.adminDID,
          bundle.metadata.sourceServerName,
          bundle.metadata.quadCount,
          data.length
        )
        .run()

      return { exportId }
    },

    async download(exportId: string): Promise<EncryptedExportBundle | null> {
      const obj = await r2.get(exportId)
      if (!obj) return null

      const text = await obj.text()
      const parsed = JSON.parse(text) as {
        ciphertext: number[]
        nonce: number[]
        metadata: EncryptedExportBundle['metadata']
      }

      return {
        ciphertext: new Uint8Array(parsed.ciphertext),
        nonce: new Uint8Array(parsed.nonce),
        metadata: parsed.metadata
      }
    },

    async delete(exportId: string): Promise<void> {
      await r2.delete(exportId)
      await db.prepare('DELETE FROM export_metadata WHERE export_id = ?').bind(exportId).run()
    },

    async listByAdmin(adminDID: string): Promise<ExportMetadata[]> {
      const result = await db
        .prepare(
          'SELECT export_id, admin_did, community_name, quad_count, size_bytes, created_at FROM export_metadata WHERE admin_did = ?'
        )
        .bind(adminDID)
        .all<{
          export_id: string
          admin_did: string
          community_name: string
          quad_count: number
          size_bytes: number
          created_at: string
        }>()

      return result.results.map((r) => ({
        exportId: r.export_id,
        adminDID: r.admin_did,
        communityName: r.community_name,
        quadCount: r.quad_count,
        sizeBytes: r.size_bytes,
        createdAt: r.created_at
      }))
    }
  }
}
