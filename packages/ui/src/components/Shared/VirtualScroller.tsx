import { createSignal, createEffect, For, onCleanup, type JSX } from 'solid-js'

export interface VirtualScrollerProps<T> {
  items: T[]
  itemHeight: number
  overscan?: number
  renderItem: (item: T, index: number) => JSX.Element
  class?: string
  onScrollTop?: () => void
}

export function VirtualScroller<T>(props: VirtualScrollerProps<T>): JSX.Element {
  let containerRef: HTMLDivElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)
  const [containerHeight, setContainerHeight] = createSignal(600)

  const overscan = () => props.overscan ?? 5
  const totalHeight = () => props.items.length * props.itemHeight
  const startIndex = () => Math.max(0, Math.floor(scrollTop() / props.itemHeight) - overscan())
  const endIndex = () =>
    Math.min(props.items.length, Math.ceil((scrollTop() + containerHeight()) / props.itemHeight) + overscan())
  const visibleItems = () => props.items.slice(startIndex(), endIndex())

  const handleScroll = () => {
    if (!containerRef) return
    setScrollTop(containerRef.scrollTop)
    if (containerRef.scrollTop === 0 && props.onScrollTop) {
      props.onScrollTop()
    }
  }

  createEffect(() => {
    if (!containerRef) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    obs.observe(containerRef)
    onCleanup(() => obs.disconnect())
  })

  return (
    <div ref={containerRef} class={`overflow-y-auto ${props.class ?? ''}`} onScroll={handleScroll}>
      <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
        <For each={visibleItems()}>
          {(item, i) => (
            <div
              style={{
                position: 'absolute',
                top: `${(startIndex() + i()) * props.itemHeight}px`,
                width: '100%',
                height: `${props.itemHeight}px`
              }}
            >
              {props.renderItem(item, startIndex() + i())}
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
