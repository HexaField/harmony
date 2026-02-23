import { Show, type JSX } from 'solid-js'
import type { LinkPreview as LinkPreviewData } from '@harmony/media'

export interface LinkPreviewProps {
  preview: LinkPreviewData
  onClick?: () => void
}

export function useLinkPreview(props: LinkPreviewProps) {
  return {
    title: () => props.preview.title ?? props.preview.url,
    description: () => props.preview.description,
    siteName: () => props.preview.siteName,
    imageUrl: () => props.preview.imageUrl,
    faviconUrl: () => props.preview.faviconUrl,
    url: () => props.preview.url,
    type: () => props.preview.type,
    open: () => props.onClick?.()
  }
}

export function LinkPreview(props: LinkPreviewProps): JSX.Element {
  const ctrl = useLinkPreview(props)

  return (
    <div
      class="rounded-lg border-l-4 border-hm-accent bg-hm-bg-dark overflow-hidden max-w-md cursor-pointer hover:bg-hm-bg-darker transition-colors"
      onClick={() => ctrl.open()}
    >
      <div class="flex">
        <div class="flex-1 p-3 min-w-0">
          <Show when={ctrl.siteName()}>
            <p class="text-xs text-hm-text-muted mb-1 flex items-center gap-1">
              <Show when={ctrl.faviconUrl()}>
                <img src={ctrl.faviconUrl()} alt="" class="w-3 h-3" />
              </Show>
              {ctrl.siteName()}
            </p>
          </Show>
          <p class="text-sm font-semibold text-hm-text-link truncate">{ctrl.title()}</p>
          <Show when={ctrl.description()}>
            <p class="text-xs text-hm-text-muted mt-1 line-clamp-2">{ctrl.description()}</p>
          </Show>
        </div>
        <Show when={ctrl.imageUrl()}>
          <div class="flex-shrink-0">
            <img src={ctrl.imageUrl()} alt="" class="w-20 h-20 object-cover" />
          </div>
        </Show>
      </div>
    </div>
  )
}
