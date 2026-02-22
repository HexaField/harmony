// ── Serialisation helpers ──
// JSON ↔ Uint8Array (base64) for wire transport

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = ''
  const len = bytes.length
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < len ? bytes[i + 1] : 0
    const b2 = i + 2 < len ? bytes[i + 2] : 0
    result += BASE64_CHARS[(b0 >> 2) & 0x3f]
    result += BASE64_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f]
    result += i + 1 < len ? BASE64_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f] : '='
    result += i + 2 < len ? BASE64_CHARS[b2 & 0x3f] : '='
  }
  return result
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/=/g, '')
  const len = clean.length
  const bytes = new Uint8Array(Math.floor((len * 3) / 4))
  let p = 0
  for (let i = 0; i < len; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i])
    const c1 = i + 1 < len ? BASE64_CHARS.indexOf(clean[i + 1]) : 0
    const c2 = i + 2 < len ? BASE64_CHARS.indexOf(clean[i + 2]) : 0
    const c3 = i + 3 < len ? BASE64_CHARS.indexOf(clean[i + 3]) : 0
    bytes[p++] = (c0 << 2) | (c1 >> 4)
    if (i + 2 < len) bytes[p++] = ((c1 << 4) | (c2 >> 2)) & 0xff
    if (i + 3 < len) bytes[p++] = ((c2 << 6) | c3) & 0xff
  }
  return bytes.slice(0, p)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON replacer/reviver
function replacer(_key: string, value: any): any {
  if (value instanceof Uint8Array) {
    return { __type: 'Uint8Array', data: uint8ArrayToBase64(value) }
  }
  return value
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON replacer/reviver
function reviver(_key: string, value: any): any {
  if (value && typeof value === 'object' && value.__type === 'Uint8Array' && typeof value.data === 'string') {
    return base64ToUint8Array(value.data)
  }
  return value
}

export function serialise<T>(data: T): string {
  return JSON.stringify(data, replacer)
}

export function deserialise<T>(json: string): T {
  return JSON.parse(json, reviver) as T
}

export function isValidISO8601(str: string): boolean {
  const d = new Date(str)
  return !isNaN(d.getTime()) && typeof str === 'string' && str.length > 0
}
