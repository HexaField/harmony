import { Show, Switch, Match, type JSX } from 'solid-js'

export interface FilePreviewProps {
  filename: string
  contentType: string
  size: number
  url?: string
  onDownload?: () => void
}

export function useFilePreview(props: FilePreviewProps) {
  const fileType = () => {
    const ct = props.contentType
    if (ct.startsWith('image/')) return 'image'
    if (ct.startsWith('video/')) return 'video'
    if (ct.startsWith('audio/')) return 'audio'
    return 'file'
  }

  const sizeDisplay = () => {
    if (props.size < 1024) return `${props.size} B`
    if (props.size < 1024 * 1024) return `${(props.size / 1024).toFixed(1)} KB`
    return `${(props.size / (1024 * 1024)).toFixed(1)} MB`
  }

  return {
    filename: () => props.filename,
    fileType,
    sizeDisplay,
    url: () => props.url,
    download: () => props.onDownload?.()
  }
}

export function FilePreview(props: FilePreviewProps): JSX.Element {
  const ctrl = useFilePreview(props)

  return (
    <div class="rounded-lg border border-hm-bg-darker bg-hm-bg-dark overflow-hidden max-w-sm">
      <Switch>
        <Match when={ctrl.fileType() === 'image' && ctrl.url()}>
          <img src={ctrl.url()} alt={ctrl.filename()} class="max-w-full max-h-64 object-contain" />
        </Match>
        <Match when={ctrl.fileType() === 'video' && ctrl.url()}>
          <video src={ctrl.url()} controls class="max-w-full max-h-64" />
        </Match>
        <Match when={ctrl.fileType() === 'audio' && ctrl.url()}>
          <div class="p-4">
            <audio src={ctrl.url()} controls class="w-full" />
          </div>
        </Match>
      </Switch>

      <div class="flex items-center gap-3 px-3 py-2">
        <span class="text-hm-text-muted text-lg">
          {ctrl.fileType() === 'image'
            ? '🖼️'
            : ctrl.fileType() === 'video'
              ? '🎬'
              : ctrl.fileType() === 'audio'
                ? '🎵'
                : '📄'}
        </span>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-hm-text-link truncate hover:underline cursor-pointer" onClick={() => ctrl.download()}>
            {ctrl.filename()}
          </p>
          <p class="text-xs text-hm-text-muted">{ctrl.sizeDisplay()}</p>
        </div>
      </div>
    </div>
  )
}
