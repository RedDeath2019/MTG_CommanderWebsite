import { parseNamedCollectionCsv } from './collection'

export type Color = 'W' | 'U' | 'B' | 'R' | 'G'
export type CardRole = 'commander' | 'land' | 'ramp' | 'draw' | 'removal' | 'wipe' | 'protection' | 'synergy' | 'flex'

export interface Card {
  id: string
  name: string
  typeLine: string
  colorIdentity: Color[]
  manaValue: number
  commanderLegal: boolean
  roles: CardRole[]
  oracleText?: string
  setCode?: string
  collectorNumber?: string
  scryfallId?: string
  imageUrl?: string
  source?: 'scryfall' | 'sample'
}


export type Collection = Record<string, number>

export function mergeCollection(current: Collection, incoming: Collection): Collection {
  const merged = { ...current }
  for (const [cardId, quantity] of Object.entries(incoming)) {
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Invalid quantity for ${cardId}.`)
    const total = (merged[cardId] ?? 0) + quantity
    if (!Number.isSafeInteger(total)) throw new Error(`Quantity for ${cardId} exceeds the safe integer limit.`)
    merged[cardId] = total
  }
  return merged
}

export interface DeckCard {
  cardId: string
  quantity: number
}

export interface Deck {
  commanderId: string
  cards: DeckCard[]
  complete: boolean
  missing: number
}

export interface DeckIssue {
  code: 'commander' | 'missing-card' | 'quantity' | 'illegal' | 'color-identity' | 'unowned' | 'singleton' | 'deck-size'
  cardId?: string
  message: string
}

const roleOrder: CardRole[] = ['land', 'ramp', 'draw', 'removal', 'wipe', 'protection', 'synergy', 'flex']

export function buildDeck(cards: Card[], collection: Collection, commanderId: string): Deck {
  const commander = cards.find((card) => card.id === commanderId)
  if (!commander || !collection[commanderId]) throw new Error('Commander must be in your collection')
  if (!commander.commanderLegal) throw new Error('Selected commander is not legal in Commander')

  const allowedColors = new Set(commander.colorIdentity)
  const basicLandException = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'])
  const candidates = cards.filter((card) =>
    card.id !== commanderId
    && (collection[card.id] ?? 0) > 0
    && card.commanderLegal
    && (basicLandException.has(card.name) || card.colorIdentity.every((color) => allowedColors.has(color))),
  )

  candidates.sort((a, b) => {
    const roleDifference = roleOrder.indexOf(a.roles.find((role) => roleOrder.includes(role)) ?? 'flex')
      - roleOrder.indexOf(b.roles.find((role) => roleOrder.includes(role)) ?? 'flex')
    return roleDifference || a.manaValue - b.manaValue || a.name.localeCompare(b.name)
  })

  const selected: DeckCard[] = []
  let remainingSlots = 99
  for (const card of candidates) {
    if (remainingSlots === 0) break
    const available = Math.max(0, collection[card.id] ?? 0)
    const isBasicLand = /Basic Land/i.test(card.typeLine)
    const quantity = isBasicLand ? Math.min(available, remainingSlots) : Math.min(1, available, remainingSlots)
    if (quantity > 0) {
      selected.push({ cardId: card.id, quantity })
      remainingSlots -= quantity
    }
  }
  const deckCards = [{ cardId: commanderId, quantity: 1 }, ...selected]
  const missing = Math.max(0, 100 - deckCards.reduce((total, card) => total + card.quantity, 0))
  return { commanderId, cards: deckCards, complete: missing === 0, missing }
}

export function validateDeck(deck: Deck, cards: Card[], collection: Collection): DeckIssue[] {
  const issues: DeckIssue[] = []
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const commander = cardById.get(deck.commanderId)
  const commanderEntries = deck.cards.filter((entry) => entry.cardId === deck.commanderId)
  if (!commander || !commander.commanderLegal || commanderEntries.length !== 1 || commanderEntries[0].quantity !== 1) {
    issues.push({ code: 'commander', cardId: deck.commanderId, message: 'Deck must contain one legal commander.' })
  }
  const allowedColors = new Set(commander?.colorIdentity ?? [])
  let total = 0
  const quantityByCard = new Map<string, number>()
  const issueKeys = new Set<string>()
  const addIssue = (issue: DeckIssue) => {
    const key = `${issue.code}:${issue.cardId ?? ''}`
    if (issueKeys.has(key)) return
    issueKeys.add(key)
    issues.push(issue)
  }

  for (const entry of deck.cards) {
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) {
      addIssue({ code: 'quantity', cardId: entry.cardId, message: 'Card quantity must be a positive whole number.' })
      continue
    }
    total += entry.quantity
    if (!Number.isSafeInteger(total)) {
      addIssue({ code: 'deck-size', message: 'Deck card total exceeds a safe integer.' })
      total = Number.MAX_SAFE_INTEGER
    }
    quantityByCard.set(entry.cardId, (quantityByCard.get(entry.cardId) ?? 0) + entry.quantity)
    const card = cardById.get(entry.cardId)
    if (!card) {
      addIssue({ code: 'missing-card', cardId: entry.cardId, message: 'Card is not in the card catalog.' })
      continue
    }
    if (!card.commanderLegal) addIssue({ code: 'illegal', cardId: card.id, message: `${card.name} is not legal in Commander.` })
    const basicLandException = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'])
    if (!basicLandException.has(card.name) && card.colorIdentity.some((color) => !allowedColors.has(color))) {
      addIssue({ code: 'color-identity', cardId: card.id, message: `${card.name} is outside the commander's color identity.` })
    }
    const isBasicLand = /Basic Land/i.test(card.typeLine)
    const quantity = quantityByCard.get(card.id) ?? 0
    if (!isBasicLand && quantity > 1) addIssue({ code: 'singleton', cardId: card.id, message: `${card.name} exceeds the Commander singleton limit.` })
  }

  for (const [cardId, quantity] of quantityByCard) {
    const card = cardById.get(cardId)
    if (card && (collection[cardId] ?? 0) < quantity) {
      addIssue({ code: 'unowned', cardId, message: `Not enough owned copies of ${card.name}.` })
    }
  }
  if (total > 100) addIssue({ code: 'deck-size', message: 'A Commander deck cannot exceed 100 cards.' })
  return issues
}

export function exportDeckList(deck: Deck, cards: Card[]): string {
  const cardById = new Map(cards.map((card) => [card.id, card]))
  return deck.cards
    .map((entry) => `${entry.quantity} ${cardById.get(entry.cardId)?.name ?? entry.cardId}`)
    .join('\n')
}

export function findOwnedCommanders(cards: Card[], collection: Collection): Card[] {
  return cards.filter((card) => card.commanderLegal && card.roles.includes('commander') && (collection[card.id] ?? 0) > 0)
}


export function importCollectionCsv(csv: string, cards: Card[]): { collection: Collection; errors: string[] } {
  return parseNamedCollectionCsv(csv, cards)
}

export const sampleCards: Card[] = [
  { id: 'alela', name: 'Alela, Artful Provocateur', typeLine: 'Legendary Creature — Faerie Wizard', colorIdentity: ['W', 'U', 'B'], manaValue: 3, commanderLegal: true, roles: ['commander', 'synergy'], source: 'sample', oracleText: 'Whenever you cast an artifact or enchantment spell, create a 1/1 blue Faerie creature token with flying. Other creatures you control with flying get +1/+0.' },
  { id: 'arcane-signet', name: 'Arcane Signet', typeLine: 'Artifact', colorIdentity: [], manaValue: 2, commanderLegal: true, roles: ['ramp'] },
  { id: 'sol-ring', name: 'Sol Ring', typeLine: 'Artifact', colorIdentity: [], manaValue: 1, commanderLegal: true, roles: ['ramp'] },
  { id: 'painful-truths', name: 'Painful Truths', typeLine: 'Sorcery', colorIdentity: ['B'], manaValue: 3, commanderLegal: true, roles: ['draw'] },
  { id: 'swords-to-plowshares', name: 'Swords to Plowshares', typeLine: 'Instant', colorIdentity: ['W'], manaValue: 1, commanderLegal: true, roles: ['removal'] },
  { id: 'counterspell', name: 'Counterspell', typeLine: 'Instant', colorIdentity: ['U'], manaValue: 2, commanderLegal: true, roles: ['protection'] },
  { id: 'scoured-barrens', name: 'Scoured Barrens', typeLine: 'Land', colorIdentity: [], manaValue: 0, commanderLegal: true, roles: ['land'] },
  { id: 'island', name: 'Island', typeLine: 'Basic Land — Island', colorIdentity: [], manaValue: 0, commanderLegal: true, roles: ['land'] },
  { id: 'plains', name: 'Plains', typeLine: 'Basic Land — Plains', colorIdentity: [], manaValue: 0, commanderLegal: true, roles: ['land'] },
  { id: 'swamp', name: 'Swamp', typeLine: 'Basic Land — Swamp', colorIdentity: [], manaValue: 0, commanderLegal: true, roles: ['land'] },
]

export const sampleCollection: Collection = {
  alela: 1, 'arcane-signet': 1, 'sol-ring': 1, 'painful-truths': 1,
  'swords-to-plowshares': 1, counterspell: 1, 'scoured-barrens': 1,
  island: 8, plains: 7, swamp: 7,
}

export function getRoleLabel(card: Card): string {
  return card.roles.find((role) => role !== 'commander') ?? 'flex'
}

export function getCard(id: string, cards: Card[] = sampleCards): Card | undefined {
  return cards.find((card) => card.id === id)
}

export function getRoleCounts(deck: Deck, cards: Card[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of deck.cards) {
    const role = getRoleLabel(cardById(entry.cardId, cards))
    counts[role] = (counts[role] ?? 0) + entry.quantity
  }
  return counts
}

function cardById(id: string, cards: Card[]): Card {
  const card = cards.find((item) => item.id === id)
  if (!card) throw new Error(`Unknown card id: ${id}`)
  return card
}

export function describeRole(role: string): string {
  const explanations: Record<string, string> = {
    land: 'Helps you make land drops and cast spells.',
    ramp: 'Helps accelerate your mana.',
    draw: 'Refills your hand or generates card advantage.',
    removal: 'Answers an opposing threat.',
    wipe: 'Resets a crowded board.',
    protection: 'Protects your plan or disrupts opponents.',
    synergy: 'Supports the commander’s game plan.',
    flex: 'A flexible owned card that fits the colors.',
  }
  return explanations[role] ?? explanations.flex
}
