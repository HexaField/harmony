// Shared components — Avatar, Badge, Modal, Tooltip, ContextMenu, Toast, Dropdown, Toggle,
// Skeleton, ErrorBoundary, FileUpload, ImageViewer, MarkdownRenderer, RelativeTime,
// InfiniteScroll, VirtualList
import { createSignal } from 'solid-js'
import type {
  AvatarProps,
  BadgeProps,
  ModalProps,
  TooltipProps,
  ContextMenuProps,
  ToastNotification,
  DropdownProps,
  ToggleProps,
  SkeletonProps,
  ErrorBoundaryProps,
  FileUploadProps,
  ImageViewerProps,
  MarkdownRendererProps,
  RelativeTimeProps,
  InfiniteScrollProps,
  VirtualListProps
} from '../../types.js'
import { t } from '../../i18n/strings.js'

export function Avatar(props: AvatarProps) {
  const initials = (props.name ?? '?').substring(0, 2).toUpperCase()
  return { initials, size: props.size ?? 'md', did: props.did }
}

export function Badge(props: BadgeProps) {
  return { text: props.text, variant: props.variant ?? 'default' }
}

export function Modal(props: ModalProps) {
  return { open: props.open, onClose: props.onClose, title: props.title, children: props.children }
}

export function Tooltip(props: TooltipProps) {
  return { text: props.text, children: props.children }
}

export function ContextMenu(props: ContextMenuProps) {
  return { items: props.items, x: props.x, y: props.y, onClose: props.onClose }
}

// Toast system
const [toasts, setToasts] = createSignal<ToastNotification[]>([])

export function addToast(notification: Omit<ToastNotification, 'id'>): string {
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
  const toast: ToastNotification = { ...notification, id }
  setToasts((prev) => [...prev, toast])
  const duration = notification.duration ?? 3000
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration)
  }
  return id
}

export function removeToast(id: string): void {
  setToasts((prev) => prev.filter((t) => t.id !== id))
}

export function getToasts(): ToastNotification[] {
  return toasts()
}

export function Dropdown(props: DropdownProps) {
  const [open, setOpen] = createSignal(false)
  return { items: props.items, trigger: props.trigger, open: open(), toggle: () => setOpen(!open()) }
}

export function Toggle(props: ToggleProps) {
  return {
    checked: props.checked,
    onChange: props.onChange,
    label: props.label
  }
}

export function Skeleton(props: SkeletonProps) {
  return { width: props.width ?? '100%', height: props.height ?? '1em', rounded: props.rounded ?? false }
}

export function ErrorBoundaryComponent(props: ErrorBoundaryProps) {
  return { fallback: props.fallback, children: props.children }
}

export function FileUpload(props: FileUploadProps) {
  return {
    onUpload: props.onUpload,
    accept: props.accept ?? '*',
    multiple: props.multiple ?? false,
    label: t('LOADING')
  }
}

export function ImageViewer(props: ImageViewerProps) {
  return { src: props.src, alt: props.alt ?? '', onClose: props.onClose }
}

// Markdown renderer — parses basic markdown to structured output
export function MarkdownRenderer(props: MarkdownRendererProps) {
  function parse(content: string): Array<{ type: string; content: string }> {
    const segments: Array<{ type: string; content: string }> = []
    // Simple markdown parsing
    const lines = content.split('\n')
    for (const line of lines) {
      if (line.startsWith('```')) {
        segments.push({ type: 'code-block', content: line.slice(3) })
      } else if (line.startsWith('# ')) {
        segments.push({ type: 'heading', content: line.slice(2) })
      } else if (line.match(/\*\*(.+?)\*\*/)) {
        segments.push({ type: 'bold', content: line })
      } else if (line.match(/_(.+?)_/) || line.match(/\*(.+?)\*/)) {
        segments.push({ type: 'italic', content: line })
      } else if (line.match(/`(.+?)`/)) {
        segments.push({ type: 'code', content: line })
      } else if (line.match(/\|\|(.+?)\|\|/)) {
        segments.push({ type: 'spoiler', content: line })
      } else if (line.match(/https?:\/\/\S+/)) {
        segments.push({ type: 'link', content: line })
      } else {
        segments.push({ type: 'text', content: line })
      }
    }
    return segments
  }

  return { segments: parse(props.content), raw: props.content }
}

export function RelativeTime(props: RelativeTimeProps) {
  const now = Date.now()
  const then = new Date(props.timestamp).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let display: string
  if (seconds < 60) display = 'just now'
  else if (minutes < 60) display = `${minutes}m ago`
  else if (hours < 24) display = `${hours}h ago`
  else display = `${days}d ago`

  return { display, timestamp: props.timestamp }
}

export function InfiniteScroll(props: InfiniteScrollProps) {
  return { onLoadMore: props.onLoadMore, hasMore: props.hasMore, children: props.children }
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const totalHeight = props.items.length * props.itemHeight
  const overscan = props.overscan ?? 5

  function getVisibleRange(scrollTop: number, containerHeight: number): { start: number; end: number } {
    const start = Math.max(0, Math.floor(scrollTop / props.itemHeight) - overscan)
    const end = Math.min(props.items.length, Math.ceil((scrollTop + containerHeight) / props.itemHeight) + overscan)
    return { start, end }
  }

  return {
    items: props.items,
    totalHeight,
    getVisibleRange,
    renderItem: props.renderItem,
    itemHeight: props.itemHeight
  }
}
