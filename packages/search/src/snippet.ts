export function extractSnippet(text: string, query: string, contextChars = 60): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // Try to find the first query term in the text
  const terms = lowerQuery.split(/\s+/).filter((t) => t.length > 0)
  let bestPos = -1

  for (const term of terms) {
    const pos = lowerText.indexOf(term)
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos
    }
  }

  if (bestPos === -1) {
    // No match found, return start of text
    return text.slice(0, contextChars * 2) + (text.length > contextChars * 2 ? '...' : '')
  }

  const start = Math.max(0, bestPos - contextChars)
  const end = Math.min(text.length, bestPos + contextChars)
  let snippet = text.slice(start, end)

  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'

  // Highlight matching terms with **bold** markers
  for (const term of terms) {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    snippet = snippet.replace(regex, '**$1**')
  }

  return snippet
}
