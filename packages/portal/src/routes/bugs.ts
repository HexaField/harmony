import { Router, type Request, type Response } from 'express'
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

interface BugReportBody {
  title: string
  description: string
  steps?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  environment: {
    appVersion?: string
    os?: string
    platform?: string
    screenSize?: string
    connectionState?: string
  }
  consoleLogs?: string[]
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'priority:low',
  medium: 'priority:medium',
  high: 'priority:high',
  critical: 'priority:critical'
}

function hashDID(did: string): string {
  return createHash('sha256').update(did).digest('hex')
}

function validateBody(body: unknown): { ok: true; data: BugReportBody } | { ok: false; error: string } {
  const b = body as Record<string, unknown>
  if (!b || typeof b !== 'object') return { ok: false, error: 'Invalid request body' }

  const { title, description, steps, severity, environment, consoleLogs } = b as Record<string, unknown>

  if (typeof title !== 'string' || title.length < 5 || title.length > 200)
    return { ok: false, error: 'title must be 5-200 characters' }
  if (typeof description !== 'string' || description.length < 10 || description.length > 5000)
    return { ok: false, error: 'description must be 10-5000 characters' }
  if (steps !== undefined && steps !== null && (typeof steps !== 'string' || (steps as string).length > 3000))
    return { ok: false, error: 'steps must be at most 3000 characters' }
  if (!['low', 'medium', 'high', 'critical'].includes(severity as string))
    return { ok: false, error: 'severity must be low, medium, high, or critical' }
  if (!environment || typeof environment !== 'object') return { ok: false, error: 'environment object is required' }

  if (consoleLogs !== undefined && consoleLogs !== null) {
    if (!Array.isArray(consoleLogs)) return { ok: false, error: 'consoleLogs must be an array' }
    if (consoleLogs.length > 50) return { ok: false, error: 'consoleLogs max 50 entries' }
    for (const entry of consoleLogs) {
      if (typeof entry !== 'string' || entry.length > 500)
        return { ok: false, error: 'Each consoleLog entry must be a string of max 500 chars' }
    }
  }

  return {
    ok: true,
    data: {
      title: title as string,
      description: description as string,
      steps: (steps as string | undefined) ?? undefined,
      severity: severity as BugReportBody['severity'],
      environment: environment as BugReportBody['environment'],
      consoleLogs: consoleLogs as string[] | undefined
    }
  }
}

function formatIssueBody(report: BugReportBody, didHash: string): string {
  const sections: string[] = []

  sections.push(`## Description\n\n${report.description}`)

  if (report.steps) {
    sections.push(`## Steps to Reproduce\n\n${report.steps}`)
  }

  const envLines: string[] = []
  const env = report.environment
  if (env.appVersion) envLines.push(`- **App Version:** ${env.appVersion}`)
  if (env.os) envLines.push(`- **OS:** ${env.os}`)
  if (env.platform) envLines.push(`- **Platform:** ${env.platform}`)
  if (env.screenSize) envLines.push(`- **Screen Size:** ${env.screenSize}`)
  if (env.connectionState) envLines.push(`- **Connection State:** ${env.connectionState}`)
  if (envLines.length > 0) {
    sections.push(`## Environment\n\n${envLines.join('\n')}`)
  }

  if (report.consoleLogs && report.consoleLogs.length > 0) {
    const logsText = report.consoleLogs.join('\n')
    sections.push(
      `<details>\n<summary>Console Logs (${report.consoleLogs.length} entries)</summary>\n\n\`\`\`\n${logsText}\n\`\`\`\n\n</details>`
    )
  }

  sections.push(`## Reporter\n\nHash: \`${didHash}\``)

  return sections.join('\n\n')
}

export function bugsRoutes(db: Database.Database): Router {
  const router = Router()

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_did_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      github_issue_number INTEGER,
      github_issue_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  const insertReport = db.prepare(
    `INSERT INTO bug_reports (reporter_did_hash, title, severity, github_issue_number, github_issue_url, created_at)
     VALUES (?, ?, ?, ?, ?, unixepoch())`
  )

  const countRecent = db.prepare(
    `SELECT COUNT(*) as cnt FROM bug_reports WHERE reporter_did_hash = ? AND created_at > unixepoch() - 3600`
  )

  router.post('/bugs', async (req: Request, res: Response) => {
    try {
      const did = (req as unknown as Record<string, unknown>).authenticatedDID as string | undefined
      if (!did) {
        res.status(401).json({ error: 'Missing authenticated DID' })
        return
      }

      const validation = validateBody(req.body)
      if (!validation.ok) {
        res.status(400).json({ error: validation.error })
        return
      }

      const report = validation.data
      const didHash = hashDID(did)

      // Rate limit: 5 per hour
      const recent = countRecent.get(didHash) as { cnt: number }
      if (recent.cnt >= 5) {
        res.status(429).json({ error: 'Rate limit exceeded. Maximum 5 bug reports per hour.' })
        return
      }

      const githubToken = process.env.GITHUB_TOKEN
      let issueNumber: number | null = null
      let issueUrl: string | null = null

      if (githubToken) {
        const body = formatIssueBody(report, didHash)
        const severityLabel = SEVERITY_LABELS[report.severity]
        const ghRes = await fetch('https://api.github.com/repos/HexaField/harmony/issues', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: report.title,
            body,
            labels: ['bug', 'user-reported', severityLabel]
          })
        })

        if (ghRes.ok) {
          const ghData = (await ghRes.json()) as { number: number; html_url: string }
          issueNumber = ghData.number
          issueUrl = ghData.html_url
        }
        // If GitHub fails, still store locally (graceful degradation)
      }

      insertReport.run(didHash, report.title, report.severity, issueNumber, issueUrl)

      if (issueUrl) {
        res.status(201).json({ issueUrl, issueNumber })
      } else {
        res.status(201).json({ stored: true, issueUrl: null })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      res.status(500).json({ error: message })
    }
  })

  return router
}
