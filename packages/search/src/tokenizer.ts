/** Simple stemming — strips common English suffixes */
function stem(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3)
  if (word.endsWith('tion') && word.length > 5) return word.slice(0, -4)
  if (word.endsWith('ness') && word.length > 5) return word.slice(0, -4)
  if (word.endsWith('ment') && word.length > 5) return word.slice(0, -4)
  if (word.endsWith('able') && word.length > 5) return word.slice(0, -4)
  if (word.endsWith('ous') && word.length > 5) return word.slice(0, -3)
  if (word.endsWith('ful') && word.length > 5) return word.slice(0, -3)
  if (word.endsWith('less') && word.length > 5) return word.slice(0, -4)
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('er') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'must',
  'of',
  'in',
  'to',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'and',
  'but',
  'or',
  'not',
  'no',
  'nor',
  'if',
  'then',
  'else',
  'when',
  'up',
  'out',
  'so',
  'than',
  'too',
  'very',
  'just',
  'about',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom'
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .map(stem)
}
