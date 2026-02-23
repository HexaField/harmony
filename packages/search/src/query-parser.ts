export interface ParsedQuery {
  terms: string[]
  phrases: string[]
}

export function parseQuery(query: string): ParsedQuery {
  const phrases: string[] = []
  const phraseRegex = /"([^"]+)"/g
  let match: RegExpExecArray | null
  let remaining = query

  while ((match = phraseRegex.exec(query)) !== null) {
    phrases.push(match[1].toLowerCase())
    remaining = remaining.replace(match[0], ' ')
  }

  const terms = remaining
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)

  return { terms, phrases }
}
