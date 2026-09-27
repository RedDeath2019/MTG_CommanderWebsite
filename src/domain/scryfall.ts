import type { Card, CardRole, Color } from './deck'

export interface ScryfallCardObject {
  id: string
  oracle_id?: string | null
  name: string
  type_line?: string
  color_identity?: string[]
  cmc?: number
  legalities?: Record<string, string>
  oracle_text?: string
  set?: string
  collector_number?: string
  image_uris?: Record<string, string>
  card_faces?: Array<{ image_uris?: Record<string, string>; oracle_text?: string }>
}

function normalizeColor(color: string): Color | null {
  return ['W', 'U', 'B', 'R', 'G'].includes(color) ? color as Color : null
}

function classifyRoles(card: ScryfallCardObject): CardRole[] {
  const roles: CardRole[] = []
  const typeLine = card.type_line?.toLowerCase() ?? ''
  const text = `${card.oracle_text ?? ''} ${card.card_faces?.map((face) => face.oracle_text ?? '').join(' ')}`.toLowerCase()
  if (typeLine.includes('legendary') && (typeLine.includes('creature') || text.includes('can be your commander'))) roles.push('commander')
  if (typeLine.includes('land')) roles.push('land')
  if (/add\s+(?:one|\{?[wubrgc0-9])/i.test(text) || /search your library for (?:a|one or more) basic land/i.test(text)) roles.push('ramp')
  if (/draw (?:a|one|two|three|x|\d+|cards?)/i.test(text) || /whenever.*draw/.test(text)) roles.push('draw')
  if (/destroy target|exile target|deals? \d+ damage to target|counter target spell/i.test(text)) roles.push('removal')
  if (/destroy all|exile all|each creature gets -/i.test(text)) roles.push('wipe')
  if (/hexproof|indestructible|protection from|ward \{/i.test(text)) roles.push('protection')
  return roles.length ? roles : ['flex']
}

export function normalizeScryfallCard(card: ScryfallCardObject): Card {
  const colorIdentity = (card.color_identity ?? []).map(normalizeColor).filter((color): color is Color => color !== null)
  const imageUrl = card.image_uris?.small ?? card.card_faces?.find((face) => face.image_uris?.small)?.image_uris?.small
  return {
    id: card.oracle_id || card.id,
    name: card.name,
    typeLine: card.type_line ?? '',
    colorIdentity,
    manaValue: card.cmc ?? 0,
    commanderLegal: card.legalities?.commander === 'legal' || card.legalities?.commander === 'restricted',
    roles: classifyRoles(card),
    oracleText: card.oracle_text ?? card.card_faces?.map((face) => face.oracle_text).filter(Boolean).join(' // '),
    setCode: card.set,
    collectorNumber: card.collector_number,
    scryfallId: card.id,
    imageUrl,
    source: 'scryfall',
  }
}

export function mergeCards(existing: Card[], incoming: Card[]): Card[] {
  const byId = new Map(existing.map((card) => [card.id, card]))
  const idByName = new Map(existing.map((card) => [card.name.trim().toLocaleLowerCase(), card.id]))
  for (const incomingCard of incoming) {
    const normalizedName = incomingCard.name.trim().toLocaleLowerCase()
    const canonicalId = byId.has(incomingCard.id) ? incomingCard.id : idByName.get(normalizedName) ?? incomingCard.id
    const previous = byId.get(canonicalId)
    const card = canonicalId === incomingCard.id ? incomingCard : { ...incomingCard, id: canonicalId }
    if (!previous) {
      byId.set(canonicalId, card)
      idByName.set(normalizedName, canonicalId)
      continue
    }
    const merged: Card = { ...previous, ...card }
    for (const key of ['oracleText', 'imageUrl', 'setCode', 'collectorNumber', 'scryfallId'] as const) {
      if (card[key] == null) (merged as unknown as Record<string, unknown>)[key] = previous[key]
    }
    byId.set(canonicalId, merged)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function searchScryfallCards(query: string, signal?: AbortSignal): Promise<Card[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const params = new URLSearchParams({ q: trimmed, unique: 'cards', order: 'name' })
  const response = await fetch(`https://api.scryfall.com/cards/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  const payload = await response.json() as { data?: ScryfallCardObject[]; details?: string }
  if (!response.ok) throw new Error(payload.details ?? `Card search failed (${response.status}).`)
  return (payload.data ?? []).map(normalizeScryfallCard)
}

export function resolveCollectionCardId(card: Card, knownCards: Card[], collection: Record<string, number>): string {
  if ((collection[card.id] ?? 0) > 0) return card.id
  const sameNamedOwned = knownCards.find((known) => (collection[known.id] ?? 0) > 0
    && known.name.trim().toLocaleLowerCase() === card.name.trim().toLocaleLowerCase())
  return sameNamedOwned?.id ?? card.id
}

export function addCardToCollection(collection: Record<string, number>, cardId: string, quantity = 1): Record<string, number> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number.')
  return { ...collection, [cardId]: (collection[cardId] ?? 0) + quantity }
}

export function decksAffectedByCard(card: Card, decks: Array<{ name: string; cardIds: string[]; colorIdentity: Color[] }>): string[] {
  return decks.filter((deck) => card.colorIdentity.every((color) => deck.colorIdentity.includes(color))
    && !deck.cardIds.includes(card.id)).map((deck) => deck.name)
}

export function newlyEnabledCommanders(
  before: Record<string, number>,
  after: Record<string, number>,
  cards: Card[],
): Card[] {
  const beforeIds = new Set(Object.keys(before).filter((id) => before[id] > 0))
  return cards.filter((card) => card.roles.includes('commander') && (after[card.id] ?? 0) > 0 && !beforeIds.has(card.id))
}