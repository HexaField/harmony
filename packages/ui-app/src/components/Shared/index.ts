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

// Markdown renderer — parses markdown to inline segments
// Supports: **bold**, *italic*, _italic_, `code`, ||spoiler||, ~~strikethrough~~,
// ```code blocks```, # headings, > blockquotes, - lists, [text](url), bare URLs, @mentions
export type MarkdownSegment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'code-block'; content: string; language?: string }
  | { type: 'spoiler'; content: string }
  | { type: 'strikethrough'; content: string }
  | { type: 'link'; content: string; href: string }
  | { type: 'mention'; content: string; did?: string }
  | { type: 'heading'; content: string; level: number }
  | { type: 'blockquote'; content: string }
  | { type: 'list-item'; content: string }
  | { type: 'newline' }

function parseInline(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  // Regex matches inline patterns in priority order
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(~~[^~]+~~)|(\|\|[^|]+\|\|)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s<>]+)|(@[\w.:-]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    const m = match[0]
    if (match[1]) {
      // `inline code`
      segments.push({ type: 'code', content: m.slice(1, -1) })
    } else if (match[2]) {
      // **bold**
      segments.push({ type: 'bold', content: m.slice(2, -2) })
    } else if (match[3]) {
      // *italic*
      segments.push({ type: 'italic', content: m.slice(1, -1) })
    } else if (match[4]) {
      // _italic_
      segments.push({ type: 'italic', content: m.slice(1, -1) })
    } else if (match[5]) {
      // ~~strikethrough~~
      segments.push({ type: 'strikethrough', content: m.slice(2, -2) })
    } else if (match[6]) {
      // ||spoiler||
      segments.push({ type: 'spoiler', content: m.slice(2, -2) })
    } else if (match[7]) {
      // [text](url)
      segments.push({ type: 'link', content: match[8], href: match[9] })
    } else if (match[10]) {
      // bare URL
      segments.push({ type: 'link', content: m, href: m })
    } else if (match[11]) {
      // @mention
      const mentionText = m.slice(1)
      segments.push({
        type: 'mention',
        content: mentionText,
        did: mentionText.startsWith('did:') ? mentionText : undefined
      })
    }
    lastIndex = match.index + m.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return segments
}

export function MarkdownRenderer(props: MarkdownRendererProps) {
  function parse(content: string): MarkdownSegment[] {
    const segments: MarkdownSegment[] = []
    const lines = content.split('\n')
    let inCodeBlock = false
    let codeBlockContent: string[] = []
    let codeBlockLang = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Multi-line code blocks
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true
          codeBlockLang = line.slice(3).trim()
          codeBlockContent = []
        } else {
          segments.push({ type: 'code-block', content: codeBlockContent.join('\n'), language: codeBlockLang })
          inCodeBlock = false
        }
        continue
      }
      if (inCodeBlock) {
        codeBlockContent.push(line)
        continue
      }

      // Add newline between lines (not before first)
      if (i > 0 && segments.length > 0) {
        segments.push({ type: 'newline' })
      }

      // Headings
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
      if (headingMatch) {
        segments.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length })
        continue
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        segments.push({ type: 'blockquote', content: line.slice(2) })
        continue
      }

      // List items
      if (line.match(/^[-*]\s+/)) {
        segments.push({ type: 'list-item', content: line.replace(/^[-*]\s+/, '') })
        continue
      }

      // Inline parsing for regular lines
      segments.push(...parseInline(line))
    }

    // Unclosed code block
    if (inCodeBlock) {
      segments.push({ type: 'code-block', content: codeBlockContent.join('\n'), language: codeBlockLang })
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
