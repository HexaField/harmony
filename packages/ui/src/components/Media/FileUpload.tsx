import { createSignal, Show, type JSX } from 'solid-js'

export interface FileUploadProps {
  onUpload: (file: { data: Uint8Array; filename: string; contentType: string; size: number }) => void
  maxSizeMB?: number
  accept?: string
  uploading?: boolean
  progress?: number
}

export function useFileUpload(props: FileUploadProps) {
  const [dragOver, setDragOver] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const maxSize = () => (props.maxSizeMB ?? 25) * 1024 * 1024

  const handleFile = (file: File) => {
    if (file.size > maxSize()) {
      setError(`File exceeds ${props.maxSizeMB ?? 25}MB limit`)
      return
    }
    setError(null)

    const reader = new FileReader()
    reader.onload = () => {
      const data = new Uint8Array(reader.result as ArrayBuffer)
      props.onUpload({
        data,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size
      })
    }
    reader.readAsArrayBuffer(file)
  }

  return {
    dragOver,
    setDragOver,
    error,
    uploading: () => props.uploading ?? false,
    progress: () => props.progress ?? 0,
    handleFile,
    maxSizeMB: () => props.maxSizeMB ?? 25
  }
}

export function FileUpload(props: FileUploadProps): JSX.Element {
  const ctrl = useFileUpload(props)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    ctrl.setDragOver(false)
    const file = e.dataTransfer?.files[0]
    if (file) ctrl.handleFile(file)
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    ctrl.setDragOver(true)
  }

  const handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) ctrl.handleFile(file)
  }

  return (
    <div
      class={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        ctrl.dragOver() ? "border-hm-accent bg-hm-accent/10" : "border-hm-bg-darker hover:border-hm-text-muted"
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => ctrl.setDragOver(false)}
    >
      <Show
        when={ctrl.uploading()}
        fallback={
          <div class="space-y-2">
            <p class="text-hm-text-muted text-sm">Drag & drop a file or</p>
            <label class="inline-block px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded cursor-pointer hover:bg-hm-accent/80 transition-colors">
              Browse
              <input type="file" class="hidden" accept={props.accept} onChange={handleInput} />
            </label>
            <p class="text-xs text-hm-text-muted">Max {ctrl.maxSizeMB()}MB</p>
          </div>
        }
      >
        <div class="space-y-2">
          <p class="text-sm text-hm-text">Uploading...</p>
          <div class="w-full bg-hm-bg-darker rounded-full h-2">
            <div class="bg-hm-accent h-2 rounded-full transition-all" style={{ width: `${ctrl.progress()}%` }} />
          </div>
          <p class="text-xs text-hm-text-muted">{Math.round(ctrl.progress())}%</p>
        </div>
      </Show>

      <Show when={ctrl.error()}>
        <p class="text-red-400 text-xs mt-2">{ctrl.error()}</p>
      </Show>
    </div>
  )
}
