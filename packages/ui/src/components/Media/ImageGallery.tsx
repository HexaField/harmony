import { createSignal, For, Show, type JSX } from 'solid-js'

export interface ImageGalleryProps {
  images: { url: string; alt?: string; filename?: string }[]
  initialIndex?: number
}

export function useImageGallery(props: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = createSignal(props.initialIndex ?? 0)
  const [lightboxOpen, setLightboxOpen] = createSignal(false)

  return {
    images: () => props.images,
    currentIndex,
    currentImage: () => props.images[currentIndex()],
    lightboxOpen,
    openLightbox: (index: number) => {
      setCurrentIndex(index)
      setLightboxOpen(true)
    },
    closeLightbox: () => setLightboxOpen(false),
    next: () => setCurrentIndex((i) => Math.min(i + 1, props.images.length - 1)),
    prev: () => setCurrentIndex((i) => Math.max(i - 1, 0)),
    hasNext: () => currentIndex() < props.images.length - 1,
    hasPrev: () => currentIndex() > 0,
    count: () => props.images.length
  }
}

export function ImageGallery(props: ImageGalleryProps): JSX.Element {
  const ctrl = useImageGallery(props)

  return (
    <>
      <div class="grid grid-cols-2 gap-1 rounded-lg overflow-hidden max-w-md">
        <For each={ctrl.images()}>
          {(img, index) => (
            <img
              src={img.url}
              alt={img.alt ?? img.filename ?? ''}
              class="w-full h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => ctrl.openLightbox(index())}
            />
          )}
        </For>
      </div>

      <Show when={ctrl.lightboxOpen()}>
        <div
          class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => ctrl.closeLightbox()}
        >
          <Show when={ctrl.hasPrev()}>
            <button
              class="absolute left-4 text-white text-3xl hover:text-hm-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                ctrl.prev()
              }}
            >
              ‹
            </button>
          </Show>

          <img
            src={ctrl.currentImage()?.url}
            alt={ctrl.currentImage()?.alt ?? ''}
            class="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <Show when={ctrl.hasNext()}>
            <button
              class="absolute right-4 text-white text-3xl hover:text-hm-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                ctrl.next()
              }}
            >
              ›
            </button>
          </Show>

          <div class="absolute top-4 right-4 text-white text-sm">
            {ctrl.currentIndex() + 1} / {ctrl.count()}
          </div>

          <button
            class="absolute top-4 left-4 text-white text-2xl hover:text-hm-accent"
            onClick={() => ctrl.closeLightbox()}
          >
            ✕
          </button>
        </div>
      </Show>
    </>
  )
}
