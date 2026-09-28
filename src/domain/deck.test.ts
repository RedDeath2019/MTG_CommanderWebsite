import { describe, expect, it } from 'vitest'
import { buildDeck, findOwnedCommanders, importCollectionCsv, mergeCollection, validateDeck, type Card, type Collection, type Deck } from './deck'

const cards: Card[] = [
  { id: 'commander', name: 'Alela, Artful Provocateur', typeLine: 'Legendary Creature — Faerie Wizard', colorIdentity: ['W', 'U', 'B'], manaValue: 3, commanderLegal: true, roles: ['commander', 'synergy'] },
  { id: 'ramp', name: 'Arcane Signet', typeLine: 'Artifact', colorIdentity: [], manaValue: 2, commanderLegal: true, roles: ['ramp'] },
  { id: 'draw', name: 'Painful Truths', typeLine: 'Sorcery', colorIdentity: ['B'], manaValue: 3, commanderLegal: true, roles: ['draw'] },
  { id: 'off-color', name: 'Cultivate', typeLine: 'Sorcery', colorIdentity: ['G'], manaValue: 3, commanderLegal: true, roles: ['ramp'] },
  { id: 'banned', name: 'Banned Example', typeLine: 'Artifact', colorIdentity: [], manaValue: 2, commanderLegal: false, roles: ['ramp'] },
  { id: 'plains', name: 'Plains', typeLine: 'Basic Land — Plains', colorIdentity: ['W'], manaValue: 0, commanderLegal: true, roles: ['land'] },
]

const collection: Collection = { commander: 1, ramp: 1, draw: 1, 'off-color': 1, banned: 1, plains: 2 }

describe('buildDeck', () => {
  it('builds a deterministic draft using only owned, legal cards in the commander identity', () => {
    const deck = buildDeck(cards, collection, 'commander')
    expect(deck.cards.map((card) => card.cardId)).toEqual(['commander', 'plains', 'ramp', 'draw'])
    expect(deck.complete).toBe(false)
    expect(deck.missing).toBe(95)
  })

  it('returns no draft when the selected commander is not owned', () => {
    expect(() => buildDeck(cards, { ramp: 1 }, 'commander')).toThrow('Commander must be in your collection')
  })

  it('rejects a format-legal card that is not commander eligible', () => {
    const ordinary = { ...cards[1], id: 'ordinary-legend', name: 'Legendary Artifact', typeLine: 'Legendary Artifact', roles: ['flex' as const] }
    expect(() => buildDeck([...cards, ordinary], { 'ordinary-legend': 1 }, 'ordinary-legend')).toThrow(/not eligible to be a Commander/)
  })

  it('uses multiple owned copies of basic lands to fill available slots', () => {
    const deck = buildDeck(cards, { commander: 1, plains: 3 }, 'commander')
    expect(deck.cards.find((card) => card.cardId === 'plains')?.quantity).toBe(3)
  })

  it('permits basic lands whose color identity is outside the commander identity', () => {
    const deck = buildDeck(cards, { commander: 1, plains: 1 }, 'commander')
    expect(deck.cards.some((card) => card.cardId === 'plains')).toBe(true)
    expect(validateDeck(deck, cards, { commander: 1, plains: 1 })).toEqual([])
  })
})

describe('validateDeck', () => {
  it('rejects a format-legal non-commander as commander', () => {
    const ordinary = { ...cards[1], id: 'ordinary-legend', name: 'Legendary Artifact', typeLine: 'Legendary Artifact', roles: ['flex' as const] }
    const deck: Deck = { commanderId: 'ordinary-legend', complete: false, missing: 99, cards: [{ cardId: 'ordinary-legend', quantity: 1 }] }
    expect(validateDeck(deck, [...cards, ordinary], { 'ordinary-legend': 1 }).some((issue) => issue.code === 'commander')).toBe(true)
  })

  it('reports unowned, illegal, and off-color cards', () => {
    const deck: Deck = {
      commanderId: 'commander', complete: false, missing: 0,
      cards: [
        { cardId: 'commander', quantity: 1 },
        { cardId: 'off-color', quantity: 1 },
        { cardId: 'banned', quantity: 1 },
        { cardId: 'draw', quantity: 2 },
      ],
    }
    const issues = validateDeck(deck, cards, { commander: 1, 'off-color': 1, banned: 1, draw: 1 })
    expect(issues.map((issue) => issue.code)).toEqual(['color-identity', 'illegal', 'singleton', 'unowned'])
  })
})

describe('collection helpers', () => {
  it('imports and aggregates supported CSV quantity rows', () => {
    expect(importCollectionCsv('name,quantity\nArcane Signet,1\nArcane Signet,2', cards)).toEqual({
      collection: { ramp: 3 }, errors: [],
    })
  })

  it('parses quoted card names containing commas', () => {
    expect(importCollectionCsv('name,quantity\n"Alela, Artful Provocateur",1', cards)).toEqual({
      collection: { commander: 1 }, errors: [],
    })
  })

  it('only lists owned legal commanders', () => {
    expect(findOwnedCommanders(cards, { commander: 1, banned: 1 }).map((card) => card.id)).toEqual(['commander'])
  })

  it('adds newly acquired cards to existing inventory instead of replacing it', () => {
    expect(mergeCollection({ ramp: 1, draw: 2 }, { ramp: 1 })).toEqual({ ramp: 2, draw: 2 })
  })
})

describe('CSV header and error handling', () => {
  it('reports invalid quantities and unresolved names without discarding valid rows', () => {
    const result = importCollectionCsv('card,count\nArcane Signet,2\nPainful Truths,zero\nUnknown,1', cards)
    expect(result.collection).toEqual({ ramp: 2 })
    expect(result.errors).toEqual([
      'Row 3: quantity must be a positive whole number.',
      'Row 4: unknown card "Unknown".',
    ])
  })
})
