import type { Deck } from './deck'

export interface SavedDeck {
  id: string
  name: string
  deck: Deck
  updatedAt: string
}

export function upsertSavedDeck(savedDecks: SavedDeck[], nextDeck: SavedDeck): SavedDeck[] {
  const name = nextDeck.name.trim()
  if (!name) throw new Error('Give this deck a name before saving.')
  const normalized = { ...nextDeck, name }
  const existingIndex = savedDecks.findIndex((saved) => saved.id === normalized.id)
  if (existingIndex < 0) return [...savedDecks, normalized]
  return savedDecks.map((saved, index) => index === existingIndex ? normalized : saved)
}

export function deleteSavedDeck(savedDecks: SavedDeck[], deckId: string): SavedDeck[] {
  return savedDecks.filter((saved) => saved.id !== deckId)
}

export function parseDeckList(text: string, cards: Array<{ id: string; name: string }>): { commanderId?: string; entries: Array<{ cardId: string; quantity: number }>; errors: string[] } {
  const cardIdsByName = new Map<string, string>()
  for (const card of cards) {
    const names = card.name.split(' // ').map((name) => name.trim().toLocaleLowerCase())
    for (const name of names) cardIdsByName.set(name, card.id)
  }
  const entries = new Map<string, number>()
  const errors: string[] = []
  const lines = text.split(/\r?\n/)
  const commanderLine = commanderLineName(text)
  let commanderId = commanderLine ? cardIdsByName.get(commanderLine.toLocaleLowerCase()) : undefined
  if (commanderLine && !commanderId) errors.push(`Commander not found in the current catalog: "${commanderLine}".`)
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//') || /^commander\s*:/i.test(line)) continue
    const match = line.match(/^(\d+)\s*[x×]?\s+(.+)$/)
    const quantity = Number(match?.[1])
    let name = (match?.[2] ?? '').trim()
    if (!Number.isInteger(quantity) || quantity < 1 || !name) {
      errors.push(`Line ${index + 1}: expected a quantity followed by a card name.`)
      continue
    }
    name = name.replace(/\s+\([^)]+\)\s+\d+\s*$/, '').trim()
    const setIndex = name.search(/\s+[A-Z0-9]{2,6}\s+\d+\s*$/)
    if (setIndex >= 0) name = name.slice(0, setIndex).trim()
    const cardId = cardIdsByName.get(name.toLocaleLowerCase())
    if (!cardId) {
      errors.push(`Line ${index + 1}: card not found in the current catalog: "${name}".`)
      continue
    }
    entries.set(cardId, (entries.get(cardId) ?? 0) + quantity)
  }
  return { commanderId, entries: [...entries].map(([cardId, quantity]) => ({ cardId, quantity })), errors }
}

export function localDateLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString()
}

// Keep import support explicit and avoid silently treating a commander line as a card row.
export function commanderLineName(text: string): string | undefined {
  const line = text.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => /^commander\s*:/i.test(entry))
  return line?.replace(/^commander\s*:\s*/i, '').trim() || undefined
}

export function normalizeDeckEntries(entries: Array<{ cardId: string; quantity: number }>): Array<{ cardId: string; quantity: number }> {
  const quantities = new Map<string, number>()
  for (const entry of entries) {
    if (Number.isInteger(entry.quantity) && entry.quantity > 0) quantities.set(entry.cardId, (quantities.get(entry.cardId) ?? 0) + entry.quantity)
  }
  return [...quantities].map(([cardId, quantity]) => ({ cardId, quantity }))
}

export function getSavedDeckId(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}