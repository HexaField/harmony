// Generate a deterministic friendly name from a DID
// e.g. "Blue Fox", "Red Panda", "Green Owl"

const COLORS = [
  'Red',
  'Blue',
  'Green',
  'Purple',
  'Gold',
  'Coral',
  'Teal',
  'Amber',
  'Rose',
  'Jade',
  'Sage',
  'Plum',
  'Sky',
  'Mint',
  'Rust',
  'Slate',
  'Peach',
  'Indigo',
  'Copper',
  'Ivory',
  'Crimson',
  'Cobalt',
  'Olive',
  'Violet',
  'Bronze',
  'Silver',
  'Ruby',
  'Cyan',
  'Onyx',
  'Pearl',
  'Scarlet',
  'Azure'
]

const ANIMALS = [
  'Fox',
  'Owl',
  'Bear',
  'Wolf',
  'Hawk',
  'Deer',
  'Hare',
  'Lynx',
  'Orca',
  'Wren',
  'Finch',
  'Crane',
  'Raven',
  'Otter',
  'Panda',
  'Tiger',
  'Falcon',
  'Badger',
  'Robin',
  'Eagle',
  'Cobra',
  'Heron',
  'Bison',
  'Viper',
  'Gecko',
  'Koala',
  'Moose',
  'Parrot',
  'Shark',
  'Whale',
  'Newt',
  'Dove'
]

function simpleHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function pseudonymFromDid(did: string): string {
  const hash = simpleHash(did)
  const color = COLORS[hash % COLORS.length]
  const animal = ANIMALS[Math.floor(hash / COLORS.length) % ANIMALS.length]
  return `${color} ${animal}`
}

export function initialsFromName(name: string): string {
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}
