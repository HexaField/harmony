import type { AuditEntry, AuditLogQuery } from './agent-auth.js'

export class AuditLog {
  private entries: AuditEntry[] = []

  log(entry: AuditEntry): void {
    this.entries.push(entry)
  }

  query(agentDID: string, opts?: AuditLogQuery): AuditEntry[] {
    let results = this.entries.filter((e) => e.agentDID === agentDID)

    if (opts?.since) {
      results = results.filter((e) => e.timestamp >= opts.since!)
    }
    if (opts?.until) {
      results = results.filter((e) => e.timestamp <= opts.until!)
    }
    if (opts?.action) {
      results = results.filter((e) => e.action === opts.action!)
    }
    if (opts?.result) {
      results = results.filter((e) => e.result === opts.result!)
    }
    if (opts?.limit) {
      results = results.slice(0, opts.limit)
    }

    return results
  }

  getAll(): AuditEntry[] {
    return [...this.entries]
  }
}
