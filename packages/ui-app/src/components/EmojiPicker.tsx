import { createSignal, For, Show, type Component } from 'solid-js'

const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: 'Smileys',
    icon: '😀',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '🤣',
      '😂',
      '🙂',
      '😊',
      '😇',
      '🥰',
      '😍',
      '🤩',
      '😘',
      '😗',
      '😚',
      '😙',
      '🥲',
      '😋',
      '😛',
      '😜',
      '🤪',
      '😝',
      '🤑',
      '🤗',
      '🤭',
      '🫢',
      '🤫',
      '🤔',
      '🫡',
      '🤐',
      '🤨',
      '😐',
      '😑',
      '😶',
      '🫥',
      '😏',
      '😒',
      '🙄',
      '😬',
      '🤥',
      '😌',
      '😔',
      '😪',
      '🤤',
      '😴',
      '😷',
      '🤒',
      '🤕',
      '🤢',
      '🤮',
      '🥵',
      '🥶',
      '🥴',
      '😵',
      '🤯',
      '🤠',
      '🥳',
      '🥸',
      '😎',
      '🤓',
      '🧐',
      '😕',
      '🫤',
      '😟',
      '🙁',
      '☹️',
      '😮',
      '😯',
      '😲',
      '😳',
      '🥺',
      '🥹',
      '😦',
      '😧',
      '😨',
      '😰',
      '😥',
      '😢',
      '😭',
      '😱',
      '😖',
      '😣',
      '😞',
      '😓',
      '😩',
      '😫',
      '🥱',
      '😤',
      '😡',
      '😠',
      '🤬',
      '😈',
      '👿',
      '💀',
      '☠️',
      '💩',
      '🤡',
      '👹',
      '👺',
      '👻',
      '👽',
      '👾',
      '🤖'
    ]
  },
  {
    name: 'Gestures',
    icon: '👋',
    emojis: [
      '👋',
      '🤚',
      '🖐️',
      '✋',
      '🖖',
      '🫱',
      '🫲',
      '🫳',
      '🫴',
      '👌',
      '🤌',
      '🤏',
      '✌️',
      '🤞',
      '🫰',
      '🤟',
      '🤘',
      '🤙',
      '👈',
      '👉',
      '👆',
      '🖕',
      '👇',
      '☝️',
      '🫵',
      '👍',
      '👎',
      '✊',
      '👊',
      '🤛',
      '🤜',
      '👏',
      '🙌',
      '🫶',
      '👐',
      '🤲',
      '🤝',
      '🙏',
      '💪',
      '🦾'
    ]
  },
  {
    name: 'Hearts',
    icon: '❤️',
    emojis: [
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '🤎',
      '💔',
      '❤️‍🔥',
      '❤️‍🩹',
      '💕',
      '💞',
      '💓',
      '💗',
      '💖',
      '💘',
      '💝',
      '💟'
    ]
  },
  {
    name: 'Objects',
    icon: '🎉',
    emojis: [
      '🎉',
      '🎊',
      '🎈',
      '🎁',
      '🏆',
      '🥇',
      '🏅',
      '⭐',
      '🌟',
      '✨',
      '💫',
      '🔥',
      '💥',
      '💯',
      '🎵',
      '🎶',
      '🎤',
      '🎧',
      '🎮',
      '🎲',
      '🎯',
      '🎪',
      '🎭',
      '🎨',
      '🖼️',
      '🎬',
      '📷',
      '📸',
      '📹',
      '📱',
      '💻',
      '⌨️',
      '🖥️',
      '📀',
      '💿',
      '📞',
      '📧',
      '📝',
      '📚',
      '📖',
      '🔗',
      '🔒',
      '🔓',
      '🔑',
      '🗝️',
      '🔧',
      '🔨',
      '⚙️',
      '🧪',
      '💡',
      '🕐',
      '⏰',
      '⏳',
      '🚀',
      '✈️',
      '🌍',
      '🌎',
      '🌏'
    ]
  },
  {
    name: 'Nature',
    icon: '🌿',
    emojis: [
      '🐶',
      '🐱',
      '🐭',
      '🐹',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🐯',
      '🦁',
      '🐮',
      '🐷',
      '🐸',
      '🐵',
      '🐔',
      '🐧',
      '🐦',
      '🦅',
      '🦋',
      '🐛',
      '🐝',
      '🐞',
      '🦀',
      '🐙',
      '🐬',
      '🐳',
      '🦈',
      '🐊',
      '🐢',
      '🌸',
      '🌺',
      '🌻',
      '🌹',
      '🌷',
      '🌱',
      '🌿',
      '☘️',
      '🍀',
      '🌲',
      '🌳',
      '🍁',
      '🍂',
      '🍃',
      '🌾',
      '🌵',
      '🍄',
      '🌈',
      '☀️',
      '🌙',
      '⭐',
      '☁️',
      '🌧️',
      '⛈️',
      '❄️',
      '🌊'
    ]
  },
  {
    name: 'Food',
    icon: '🍕',
    emojis: [
      '🍎',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🫐',
      '🍑',
      '🥝',
      '🍅',
      '🥑',
      '🌽',
      '🥕',
      '🧄',
      '🧅',
      '🥔',
      '🍞',
      '🥐',
      '🧀',
      '🍕',
      '🍔',
      '🌭',
      '🌮',
      '🌯',
      '🍜',
      '🍝',
      '🍣',
      '🍱',
      '🍩',
      '🍪',
      '🎂',
      '🍰',
      '🧁',
      '🍫',
      '🍬',
      '🍭',
      '☕',
      '🍵',
      '🧃',
      '🍺',
      '🍻',
      '🥂',
      '🍷',
      '🥃',
      '🧋'
    ]
  },
  {
    name: 'Flags',
    icon: '🏁',
    emojis: [
      '🏁',
      '🚩',
      '🎌',
      '🏴',
      '🏳️',
      '🏳️‍🌈',
      '🏳️‍⚧️',
      '🏴‍☠️',
      '🇦🇺',
      '🇧🇷',
      '🇨🇦',
      '🇨🇳',
      '🇫🇷',
      '🇩🇪',
      '🇮🇳',
      '🇮🇹',
      '🇯🇵',
      '🇰🇷',
      '🇲🇽',
      '🇳🇿',
      '🇷🇺',
      '🇪🇸',
      '🇬🇧',
      '🇺🇸'
    ]
  }
]

// Common shortcodes
const SHORTCODE_MAP: Record<string, string> = {
  ':)': '😊',
  ':-)': '😊',
  ':D': '😃',
  ':-D': '😃',
  ';)': '😉',
  ';-)': '😉',
  ':(': '😞',
  ':-(': '😞',
  ":'(": '😢',
  ':P': '😛',
  ':-P': '😛',
  ':O': '😮',
  ':-O': '😮',
  '<3': '❤️',
  '</3': '💔',
  ':fire:': '🔥',
  ':heart:': '❤️',
  ':thumbsup:': '👍',
  ':thumbsdown:': '👎',
  ':clap:': '👏',
  ':wave:': '👋',
  ':100:': '💯',
  ':tada:': '🎉',
  ':party:': '🎉',
  ':rocket:': '🚀',
  ':star:': '⭐',
  ':sparkles:': '✨',
  ':check:': '✅',
  ':x:': '❌',
  ':warning:': '⚠️',
  ':eyes:': '👀',
  ':thinking:': '🤔',
  ':laugh:': '😂',
  ':cry:': '😢',
  ':angry:': '😠',
  ':cool:': '😎',
  ':nerd:': '🤓',
  ':skull:': '💀',
  ':ghost:': '👻',
  ':alien:': '👽',
  ':robot:': '🤖',
  ':pray:': '🙏',
  ':muscle:': '💪',
  ':ok:': '👌',
  ':peace:': '✌️',
  ':brain:': '🧠',
  ':bulb:': '💡',
  ':gem:': '💎',
  ':crown:': '👑',
  ':sun:': '☀️',
  ':moon:': '🌙',
  ':rainbow:': '🌈',
  ':cloud:': '☁️',
  ':rain:': '🌧️',
  ':snow:': '❄️',
  ':pizza:': '🍕',
  ':coffee:': '☕',
  ':beer:': '🍺',
  ':wine:': '🍷',
  ':cake:': '🎂',
  ':cookie:': '🍪',
  ':dog:': '🐶',
  ':cat:': '🐱',
  ':fish:': '🐟',
  ':butterfly:': '🦋',
  ':tree:': '🌳',
  ':flower:': '🌸',
  ':rose:': '🌹',
  ':herb:': '🌿',
  ':poop:': '💩',
  ':clown:': '🤡',
  ':money:': '💰',
  ':bomb:': '💣',
  ':lock:': '🔒',
  ':key:': '🔑',
  ':link:': '🔗',
  ':pin:': '📌',
  ':book:': '📖',
  ':pencil:': '✏️',
  ':hammer:': '🔨',
  ':gear:': '⚙️'
}

export function resolveShortcodes(text: string): string {
  // Replace :shortcode: patterns
  return (
    text
      .replace(/:[\w+-]+:/g, (match) => SHORTCODE_MAP[match] ?? match)
      // Replace common text emoticons at word boundaries
      .replace(/(?:^|\s)(:\)|:-\)|:D|:-D|;\)|;-\)|:\(|:-\(|:'?\(|:P|:-P|:O|:-O|<3|<\/3)(?:\s|$)/g, (full, emoticon) => {
        const emoji = SHORTCODE_MAP[emoticon]
        return emoji ? full.replace(emoticon, emoji) : full
      })
  )
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export const EmojiPicker: Component<EmojiPickerProps> = (props) => {
  const [search, setSearch] = createSignal('')
  const [activeCategory, setActiveCategory] = createSignal(0)

  const filteredEmojis = () => {
    const q = search().toLowerCase()
    if (!q) return null
    const results: string[] = []
    // Search shortcodes
    for (const [code, emoji] of Object.entries(SHORTCODE_MAP)) {
      if (code.includes(q) && !results.includes(emoji)) results.push(emoji)
    }
    // Search category names
    for (const cat of EMOJI_CATEGORIES) {
      if (cat.name.toLowerCase().includes(q)) {
        for (const e of cat.emojis) {
          if (!results.includes(e)) results.push(e)
        }
      }
    }
    return results.slice(0, 50)
  }

  return (
    <div
      class="absolute bottom-full mb-2 left-0 w-80 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] shadow-xl z-50 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div class="p-2 border-b border-[var(--border)]">
        <input
          type="text"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search emoji..."
          class="w-full px-2 py-1.5 bg-[var(--bg-input)] rounded text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border border-[var(--border)] focus:border-[var(--accent)]"
          autofocus
        />
      </div>

      {/* Category tabs */}
      <Show when={!search()}>
        <div class="flex border-b border-[var(--border)] px-1">
          <For each={EMOJI_CATEGORIES}>
            {(cat, i) => (
              <button
                class="p-1.5 text-sm hover:bg-[var(--bg-input)] rounded transition-colors"
                classList={{ 'bg-[var(--bg-input)]': activeCategory() === i() }}
                onClick={() => setActiveCategory(i())}
                title={cat.name}
              >
                {cat.icon}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Emoji grid */}
      <div class="h-48 overflow-y-auto p-2">
        <Show
          when={search()}
          fallback={
            <>
              <div class="text-xs text-[var(--text-muted)] mb-1 font-medium">
                {EMOJI_CATEGORIES[activeCategory()].name}
              </div>
              <div class="grid grid-cols-8 gap-0.5">
                <For each={EMOJI_CATEGORIES[activeCategory()].emojis}>
                  {(emoji) => (
                    <button
                      class="p-1 text-xl hover:bg-[var(--bg-input)] rounded transition-colors text-center"
                      onClick={() => {
                        props.onSelect(emoji)
                        props.onClose()
                      }}
                    >
                      {emoji}
                    </button>
                  )}
                </For>
              </div>
            </>
          }
        >
          <div class="grid grid-cols-8 gap-0.5">
            <For each={filteredEmojis() ?? []}>
              {(emoji) => (
                <button
                  class="p-1 text-xl hover:bg-[var(--bg-input)] rounded transition-colors text-center"
                  onClick={() => {
                    props.onSelect(emoji)
                    props.onClose()
                  }}
                >
                  {emoji}
                </button>
              )}
            </For>
            <Show when={(filteredEmojis() ?? []).length === 0}>
              <div class="col-span-8 text-center text-sm text-[var(--text-muted)] py-4">No emoji found</div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
