import { For, Show, type Component } from 'solid-js'
import { formatFileSize, isImageMimeType } from '../../views/MessageArea.js'
import type { AttachmentData } from '../../types.js'

export interface AttachmentDisplayProps {
  attachments: AttachmentData[]
  onImageClick?: (url: string) => void
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  if (mimeType.includes('pdf')) return '📄'
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compress')) return '📦'
  return '📎'
}

export const AttachmentDisplay: Component<AttachmentDisplayProps> = (props) => {
  return (
    <div class="flex flex-wrap gap-2 mt-2">
      <For each={props.attachments}>
        {(attachment) => (
          <Show
            when={isImageMimeType(attachment.mimeType)}
            fallback={
              <a
                href={attachment.url}
                download={attachment.filename}
                class="flex items-center gap-2 px-3 py-2 bg-[var(--bg-input)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-colors max-w-xs"
              >
                <span class="text-lg">{fileIcon(attachment.mimeType)}</span>
                <div class="min-w-0">
                  <div class="text-sm text-[var(--text-primary)] truncate">{attachment.filename}</div>
                  <div class="text-xs text-[var(--text-muted)]">{formatFileSize(attachment.size)}</div>
                </div>
              </a>
            }
          >
            <div
              class="cursor-pointer rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
              onClick={() => props.onImageClick?.(attachment.url)}
            >
              <img
                src={attachment.url}
                alt={attachment.filename}
                class="max-w-[400px] max-h-[300px] object-contain"
                loading="lazy"
              />
            </div>
          </Show>
        )}
      </For>
    </div>
  )
}
