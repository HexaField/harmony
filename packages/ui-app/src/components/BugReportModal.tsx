import { createSignal, Show, For, type Component } from 'solid-js'
import { submitBugReport, type BugReport } from '../api/portal.js'
import { getRecentErrors } from '../utils/error-buffer.js'

function parseOS(): string {
  const ua = navigator.userAgent
  if (ua.includes('Mac OS')) return 'macOS'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  return ua.slice(0, 80)
}

function parsePlatform(): string {
  const ua = navigator.userAgent
  const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)
  return match ? match[0] : navigator.userAgent.slice(0, 60)
}

interface BugReportModalProps {
  onClose: () => void
  portalUrl: string
  did: string
  connectionState: string
}

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

export const BugReportModal: Component<BugReportModalProps> = (props) => {
  const [title, setTitle] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [steps, setSteps] = createSignal('')
  const [severity, setSeverity] = createSignal<BugReport['severity']>('medium')
  const [includeErrors, setIncludeErrors] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [success, setSuccess] = createSignal<{ issueNumber?: number; issueUrl: string | null } | null>(null)
  const [error, setError] = createSignal('')

  const environment = {
    appVersion: '0.1.0',
    os: parseOS(),
    platform: parsePlatform(),
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    connectionState: props.connectionState
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const report: BugReport = {
      title: title(),
      description: description(),
      severity: severity(),
      environment
    }

    const stepsVal = steps().trim()
    if (stepsVal) report.steps = stepsVal

    if (includeErrors()) {
      const errors = getRecentErrors()
      if (errors.length > 0) {
        report.consoleLogs = errors.map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.message}`)
      }
    }

    try {
      const result = await submitBugReport(props.portalUrl, props.did, report)
      setSuccess(result)
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMITED') {
        setError('Please wait before submitting another report.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to submit bug report')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div class="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 class="text-lg font-bold">🐛 Report a Bug</h2>
          <button onClick={props.onClose} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">
            &times;
          </button>
        </div>

        <Show when={success()}>
          <div class="p-6 text-center">
            <p class="text-lg font-semibold text-green-400 mb-2">Bug reported!</p>
            <Show when={success()!.issueNumber}>
              <p class="text-sm text-[var(--text-secondary)]">
                Issue #{success()!.issueNumber}
                <Show when={success()!.issueUrl}>
                  {' — '}
                  <a
                    href={success()!.issueUrl!}
                    target="_blank"
                    rel="noopener"
                    class="text-[var(--accent)] hover:underline"
                  >
                    View on GitHub
                  </a>
                </Show>
              </p>
            </Show>
            <Show when={!success()!.issueNumber}>
              <p class="text-sm text-[var(--text-muted)]">Report saved locally. Thank you!</p>
            </Show>
            <button
              onClick={props.onClose}
              class="mt-4 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </Show>

        <Show when={!success()}>
          <form onSubmit={handleSubmit} class="p-4 space-y-4">
            {/* Title */}
            <div>
              <label class="text-sm text-[var(--text-muted)] block mb-1">Title *</label>
              <input
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder="Brief description of the issue"
                minLength={5}
                maxLength={200}
                required
                class="w-full p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
              />
            </div>

            {/* Description */}
            <div>
              <label class="text-sm text-[var(--text-muted)] block mb-1">Description *</label>
              <textarea
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                placeholder="What happened? What did you expect to happen?"
                minLength={10}
                maxLength={5000}
                required
                rows={4}
                class="w-full p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm resize-y"
              />
            </div>

            {/* Steps */}
            <div>
              <label class="text-sm text-[var(--text-muted)] block mb-1">Steps to Reproduce (optional)</label>
              <textarea
                value={steps()}
                onInput={(e) => setSteps(e.currentTarget.value)}
                placeholder="1. Go to...\n2. Click on...\n3. See error"
                maxLength={3000}
                rows={3}
                class="w-full p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm resize-y"
              />
            </div>

            {/* Severity */}
            <div>
              <label class="text-sm text-[var(--text-muted)] block mb-1">Severity</label>
              <select
                value={severity()}
                onChange={(e) => setSeverity(e.currentTarget.value as BugReport['severity'])}
                class="w-full p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
              >
                <For each={SEVERITIES}>
                  {(s) => <option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>}
                </For>
              </select>
            </div>

            {/* Include errors checkbox */}
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="include-errors"
                checked={includeErrors()}
                onChange={(e) => setIncludeErrors(e.currentTarget.checked)}
                class="rounded"
              />
              <label for="include-errors" class="text-sm text-[var(--text-secondary)]">
                Include recent console errors ({getRecentErrors().length})
              </label>
            </div>

            {/* Environment (read-only) */}
            <div class="bg-[var(--bg-surface)] p-3 rounded-lg">
              <label class="text-xs text-[var(--text-muted)] block mb-1">Environment (auto-collected)</label>
              <div class="text-xs text-[var(--text-muted)] space-y-0.5">
                <p>Version: {environment.appVersion}</p>
                <p>OS: {environment.os}</p>
                <p>Platform: {environment.platform}</p>
                <p>Screen: {environment.screenSize}</p>
                <p>Connection: {environment.connectionState}</p>
              </div>
            </div>

            {/* Error message */}
            <Show when={error()}>
              <p class="text-sm text-[var(--error)]">{error()}</p>
            </Show>

            {/* Submit */}
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={props.onClose}
                class="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading()}
                class="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {loading() ? 'Submitting…' : 'Submit Bug Report'}
              </button>
            </div>
          </form>
        </Show>
      </div>
    </div>
  )
}
