import { createSignal, Show, Switch, Match, onCleanup, type Component } from 'solid-js'
import { useAppStore } from '../../store.tsx'
import {
  startExport,
  pollExport,
  importBundle,
  type MigrationAuth,
  type ExportStatus,
  type ExportProgress
} from '../../migration-client.js'

export interface MigrationWizardProps {
  onComplete: () => void
}

export interface MigrationSummary {
  channels: number
  messages: number
  members: number
  roles: number
}

type Step = 'token' | 'export' | 'preview' | 'import' | 'complete'

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: '0',
    'z-index': '100',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    background: 'rgba(0,0,0,0.6)'
  },
  modal: {
    background: 'var(--bg-primary, #1a1a2e)',
    border: '1px solid var(--border, #333)',
    'border-radius': '12px',
    padding: '32px',
    'min-width': '440px',
    'max-width': '520px',
    color: 'var(--text-primary, #e0e0e0)'
  },
  title: {
    'font-size': '1.25rem',
    'font-weight': '600',
    'margin-bottom': '24px'
  },
  label: {
    display: 'block',
    'font-size': '0.85rem',
    color: 'var(--text-secondary, #a0a0a0)',
    'margin-bottom': '6px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-secondary, #16213e)',
    border: '1px solid var(--border, #333)',
    'border-radius': '6px',
    color: 'var(--text-primary, #e0e0e0)',
    'font-size': '0.9rem',
    'margin-bottom': '16px',
    outline: 'none',
    'box-sizing': 'border-box' as const
  },
  btn: {
    padding: '10px 20px',
    background: 'var(--accent, #7c3aed)',
    color: '#fff',
    border: 'none',
    'border-radius': '6px',
    cursor: 'pointer',
    'font-size': '0.9rem',
    'font-weight': '500'
  },
  btnDisabled: {
    opacity: '0.5',
    cursor: 'not-allowed'
  },
  btnSecondary: {
    padding: '10px 20px',
    background: 'var(--bg-secondary, #16213e)',
    color: 'var(--text-secondary, #a0a0a0)',
    border: '1px solid var(--border, #333)',
    'border-radius': '6px',
    cursor: 'pointer',
    'font-size': '0.9rem'
  },
  row: {
    display: 'flex',
    gap: '12px',
    'justify-content': 'flex-end',
    'margin-top': '24px'
  },
  progress: {
    background: 'var(--bg-secondary, #16213e)',
    'border-radius': '8px',
    padding: '20px',
    'margin-top': '16px'
  },
  progressBar: {
    height: '6px',
    background: 'var(--border, #333)',
    'border-radius': '3px',
    'margin-top': '12px',
    overflow: 'hidden'
  },
  stat: {
    display: 'flex',
    'justify-content': 'space-between',
    padding: '8px 0',
    'border-bottom': '1px solid var(--border, #333)',
    'font-size': '0.9rem'
  },
  error: {
    color: '#ef4444',
    'font-size': '0.85rem',
    'margin-top': '8px'
  }
}

export const MigrationWizard: Component<MigrationWizardProps> = (props) => {
  const store = useAppStore()

  // Get auth credentials from store for migration API calls
  const getAuth = (): MigrationAuth | undefined => {
    const kp = store.keyPair()
    const did = store.did()
    if (!kp?.secretKey || !did) return undefined
    const sk = kp.secretKey instanceof Uint8Array ? kp.secretKey : new Uint8Array(Object.values(kp.secretKey))
    return { did, secretKey: sk }
  }

  const [step, setStep] = createSignal<Step>('token')
  const [botToken, setBotToken] = createSignal('')
  const [guildId, setGuildId] = createSignal('')
  const [error, setError] = createSignal('')

  // Export state
  const [, setExportId] = createSignal('')
  const [progress, setProgress] = createSignal<ExportProgress | null>(null)
  const [exportResult, setExportResult] = createSignal<ExportStatus | null>(null)
  const [exporting, setExporting] = createSignal(false)

  // Import state
  const [, setImporting] = createSignal(false)
  const [summary, setSummary] = createSignal<MigrationSummary | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | undefined

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  const serverUrl = () => {
    const servers = store.servers()
    return servers.length > 0 ? servers[0].url : ''
  }

  async function handleStartExport() {
    setError('')
    setExporting(true)
    try {
      const id = await startExport({
        serverUrl: serverUrl(),
        botToken: botToken(),
        guildId: guildId(),
        adminDID: store.did(),
        auth: getAuth()
      })
      setExportId(id)

      pollTimer = setInterval(async () => {
        try {
          const status = await pollExport(serverUrl(), id, getAuth())
          setProgress(status.progress)
          if (status.status === 'complete') {
            clearInterval(pollTimer!)
            pollTimer = undefined
            setExportResult(status)
            setExporting(false)
            setStep('preview')
          } else if (status.status === 'error') {
            clearInterval(pollTimer!)
            pollTimer = undefined
            setExporting(false)
            setError(status.error || 'Export failed')
          }
        } catch (e: any) {
          clearInterval(pollTimer!)
          pollTimer = undefined
          setExporting(false)
          setError(e.message)
        }
      }, 1500)
    } catch (e: any) {
      setExporting(false)
      setError(e.message)
    }
  }

  async function handleImport() {
    setError('')
    setImporting(true)
    try {
      const result = exportResult()
      if (!result?.bundle) throw new Error('No export bundle available')

      const importResult = await importBundle({
        serverUrl: serverUrl(),
        bundle: result.bundle,
        adminDID: store.did(),
        communityName: result.bundle.guild?.name || 'Imported Server',
        adminKeyPair: result.adminKeyPair,
        auth: getAuth()
      })

      setSummary({
        channels: importResult.channels?.length ?? 0,
        messages: result.bundle.messages?.length ?? result.progress?.total ?? 0,
        members: importResult.members?.length ?? 0,
        roles: result.bundle.roles?.length ?? 0
      })
      setImporting(false)
      setStep('complete')
    } catch (e: any) {
      setImporting(false)
      setError(e.message)
    }
  }

  const progressPercent = () => {
    const p = progress()
    if (!p || p.total === 0) return 0
    return Math.round((p.current / p.total) * 100)
  }

  const previewMeta = () => {
    const r = exportResult()
    if (!r?.bundle) return { channels: 0, members: 0, messages: 0 }
    return {
      channels: r.bundle.channels?.length ?? 0,
      members: r.bundle.members?.length ?? 0,
      messages: r.bundle.messages?.length ?? r.progress?.total ?? 0
    }
  }

  return (
    <div style={styles.overlay} onClick={() => props.onComplete()}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <Switch>
          {/* Step 1: Token */}
          <Match when={step() === 'token'}>
            <div style={styles.title}>Import from Discord</div>
            <label style={styles.label}>Discord Bot Token</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Enter your bot token"
              value={botToken()}
              onInput={(e) => setBotToken(e.currentTarget.value)}
            />
            <label style={styles.label}>Guild / Server ID</label>
            <input
              style={styles.input}
              type="text"
              placeholder="e.g. 123456789012345678"
              value={guildId()}
              onInput={(e) => setGuildId(e.currentTarget.value)}
            />
            <Show when={error()}>
              <div style={styles.error}>{error()}</div>
            </Show>
            <div style={styles.row}>
              <button style={styles.btnSecondary} onClick={() => props.onComplete()}>
                Cancel
              </button>
              <button
                style={{ ...styles.btn, ...(!botToken() || !guildId() ? styles.btnDisabled : {}) }}
                disabled={!botToken() || !guildId()}
                onClick={() => {
                  setStep('export')
                  setError('')
                }}
              >
                Next
              </button>
            </div>
          </Match>

          {/* Step 2: Export */}
          <Match when={step() === 'export'}>
            <div style={styles.title}>Export from Discord</div>
            <Show when={!exporting() && !progress()}>
              <p style={{ color: 'var(--text-secondary, #a0a0a0)', 'margin-bottom': '16px', 'font-size': '0.9rem' }}>
                This will export channels, roles, members, and messages from your Discord server.
              </p>
              <Show when={error()}>
                <div style={styles.error}>{error()}</div>
              </Show>
              <div style={styles.row}>
                <button style={styles.btnSecondary} onClick={() => setStep('token')}>
                  Back
                </button>
                <button style={styles.btn} onClick={handleStartExport}>
                  Start Export
                </button>
              </div>
            </Show>
            <Show when={exporting() || progress()}>
              <div style={styles.progress}>
                <div style={{ display: 'flex', 'justify-content': 'space-between', 'font-size': '0.85rem' }}>
                  <span style={{ 'text-transform': 'capitalize' }}>{progress()?.phase ?? 'Starting...'}</span>
                  <span>{progressPercent()}%</span>
                </div>
                <Show when={progress()?.channelName}>
                  <div style={{ color: 'var(--text-secondary, #a0a0a0)', 'font-size': '0.8rem', 'margin-top': '4px' }}>
                    #{progress()!.channelName}
                  </div>
                </Show>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progressPercent()}%`,
                      background: 'var(--accent, #7c3aed)',
                      'border-radius': '3px',
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
                <div style={{ 'font-size': '0.8rem', color: 'var(--text-secondary, #a0a0a0)', 'margin-top': '8px' }}>
                  {progress()?.current ?? 0} / {progress()?.total ?? '?'}
                </div>
              </div>
              <Show when={error()}>
                <div style={styles.error}>{error()}</div>
              </Show>
            </Show>
          </Match>

          {/* Step 3: Preview */}
          <Match when={step() === 'preview'}>
            <div style={styles.title}>Export Complete</div>
            <div style={styles.progress}>
              <div style={styles.stat}>
                <span>Channels</span>
                <span>{previewMeta().channels}</span>
              </div>
              <div style={styles.stat}>
                <span>Members</span>
                <span>{previewMeta().members}</span>
              </div>
              <div style={{ ...styles.stat, 'border-bottom': 'none' }}>
                <span>Messages</span>
                <span>{previewMeta().messages}</span>
              </div>
            </div>
            <div style={styles.row}>
              <button style={styles.btnSecondary} onClick={() => props.onComplete()}>
                Cancel
              </button>
              <button
                style={styles.btn}
                onClick={() => {
                  setStep('import')
                  handleImport()
                }}
              >
                Import to Harmony
              </button>
            </div>
          </Match>

          {/* Step 4: Import */}
          <Match when={step() === 'import'}>
            <div style={styles.title}>Importing...</div>
            <div style={{ 'text-align': 'center', padding: '32px 0' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid var(--border, #333)',
                  'border-top-color': 'var(--accent, #7c3aed)',
                  'border-radius': '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px'
                }}
              />
              <p style={{ color: 'var(--text-secondary, #a0a0a0)', 'font-size': '0.9rem' }}>
                Importing your Discord data into Harmony...
              </p>
            </div>
            <Show when={error()}>
              <div style={styles.error}>{error()}</div>
              <div style={styles.row}>
                <button
                  style={styles.btn}
                  onClick={() => {
                    setStep('preview')
                    setError('')
                  }}
                >
                  Retry
                </button>
              </div>
            </Show>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </Match>

          {/* Step 5: Complete */}
          <Match when={step() === 'complete'}>
            <div style={styles.title}>Import Complete! 🎉</div>
            <div style={styles.progress}>
              <div style={styles.stat}>
                <span>Channels</span>
                <span>{summary()?.channels ?? 0}</span>
              </div>
              <div style={styles.stat}>
                <span>Messages</span>
                <span>{summary()?.messages ?? 0}</span>
              </div>
              <div style={styles.stat}>
                <span>Members</span>
                <span>{summary()?.members ?? 0}</span>
              </div>
              <div style={{ ...styles.stat, 'border-bottom': 'none' }}>
                <span>Roles</span>
                <span>{summary()?.roles ?? 0}</span>
              </div>
            </div>
            <div style={styles.row}>
              <button style={styles.btn} onClick={() => props.onComplete()}>
                Done
              </button>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

// Exported for backwards-compatible test usage
export function MigrationProgress(props: { phase: string; current: number; total: number; channelName?: string }) {
  const percent = props.total > 0 ? Math.round((props.current / props.total) * 100) : 0
  return { phase: props.phase, current: props.current, total: props.total, percent, channelName: props.channelName }
}

export function MigrationComplete(props: { summary: MigrationSummary }) {
  return { summary: props.summary, title: 'Import complete' }
}
