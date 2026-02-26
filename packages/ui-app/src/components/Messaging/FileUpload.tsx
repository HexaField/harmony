import { For, Show, type Component, type Setter } from 'solid-js'
import { formatFileSize, isImageMimeType } from '../../views/MessageArea.js'
import type { AttachmentData } from '../../types.js'

export interface FileUploadProps {
  pendingAttachments: AttachmentData[]
  onRemove: (id: string) => void
  uploading: boolean
  uploadProgress: string
  maxFileSize?: number
}

export const FileUpload: Component<FileUploadProps> = (props) => {
  const maxSize = () => props.maxFileSize ?? 10 * 1024 * 1024

  return (
    <div>
      <Show when={props.uploading}>
        <div class="flex items-center gap-2 px-3 py-2 mb-2 bg-[var(--bg-input)] rounded-lg text-sm text-[var(--text-muted)]">
          <div class="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span>{props.uploadProgress || 'Processing...'}</span>
        </div>
      </Show>

      <Show when={props.pendingAttachments.length > 0}>
        <div class="flex flex-wrap gap-2 px-3 py-2 mb-2 bg-[var(--bg-input)] rounded-lg border border-[var(--border)]">
          <For each={props.pendingAttachments}>
            {(attachment) => (
              <div class="relative group">
                <Show
                  when={isImageMimeType(attachment.mimeType)}
                  fallback={
                    <div class="flex items-center gap-1 px-2 py-1 bg-[var(--bg-surface)] rounded text-xs">
                      <span class="text-[var(--text-primary)] max-w-[120px] truncate">{attachment.filename}</span>
                      <span class="text-[var(--text-muted)]">{formatFileSize(attachment.size)}</span>
                    </div>
                  }
                >
                  <img src={attachment.url} alt={attachment.filename} class="w-16 h-16 object-cover rounded" />
                </Show>
                <button
                  onClick={() => props.onRemove(attachment.id)}
                  class="absolute -top-1 -right-1 w-4 h-4 bg-[var(--error)] text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            )}
          </For>
          <div class="text-[10px] text-[var(--text-muted)] self-end">Max {formatFileSize(maxSize())}</div>
        </div>
      </Show>
    </div>
  )
}
