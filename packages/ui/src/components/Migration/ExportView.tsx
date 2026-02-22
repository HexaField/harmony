import { createSignal, Show, type JSX } from 'solid-js'

export interface ExportViewProps {
  communityId: string
  communityName: string
  onExport: (format: 'json' | 'rdf') => void
}

export function ExportView(props: ExportViewProps): JSX.Element {
  const [format, setFormat] = createSignal<'json' | 'rdf'>('json')
  const [exporting, setExporting] = createSignal(false)
  const [done, setDone] = createSignal(false)

  const handleExport = () => {
    setExporting(true)
    props.onExport(format())
    setTimeout(() => {
      setExporting(false)
      setDone(true)
    }, 1500)
  }

  return (
    <div class="p-6 max-w-lg mx-auto">
      <h2 class="text-xl font-bold text-white mb-2">Export Community Data</h2>
      <p class="text-hm-text-muted text-sm mb-6">
        Export data from <span class="text-white">{props.communityName}</span>
      </p>

      <div class="space-y-3 mb-6">
        <label class="flex items-center gap-3 p-3 bg-hm-bg-dark rounded-lg cursor-pointer hover:bg-hm-bg-darker transition-colors">
          <input type="radio" name="format" checked={format() === 'json'} onChange={() => setFormat('json')} />
          <div>
            <span class="text-white text-sm font-medium">JSON</span>
            <span class="text-hm-text-muted text-xs block">Standard JSON format</span>
          </div>
        </label>
        <label class="flex items-center gap-3 p-3 bg-hm-bg-dark rounded-lg cursor-pointer hover:bg-hm-bg-darker transition-colors">
          <input type="radio" name="format" checked={format() === 'rdf'} onChange={() => setFormat('rdf')} />
          <div>
            <span class="text-white text-sm font-medium">RDF/Turtle</span>
            <span class="text-hm-text-muted text-xs block">Linked data format</span>
          </div>
        </label>
      </div>

      <Show
        when={!done()}
        fallback={
          <div class="text-center py-4">
            <span class="text-2xl">✅</span>
            <p class="text-white font-medium mt-2">Export Complete</p>
          </div>
        }
      >
        <button
          class="w-full py-2.5 bg-hm-accent hover:bg-hm-accent-hover text-white rounded-md font-medium transition-colors disabled:opacity-50"
          disabled={exporting()}
          onClick={handleExport}
        >
          {exporting() ? 'Exporting...' : `Export as ${format().toUpperCase()}`}
        </button>
      </Show>
    </div>
  )
}
