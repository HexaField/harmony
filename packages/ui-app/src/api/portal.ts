export interface BugReport {
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

export interface BugReportResponse {
  issueUrl: string | null
  issueNumber?: number
  stored?: boolean
}

export async function submitBugReport(portalUrl: string, did: string, report: BugReport): Promise<BugReportResponse> {
  const res = await fetch(`${portalUrl}/api/bugs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${did}.bugreport`
    },
    body: JSON.stringify(report)
  })

  if (res.status === 429) {
    throw new Error('RATE_LIMITED')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<BugReportResponse>
}
