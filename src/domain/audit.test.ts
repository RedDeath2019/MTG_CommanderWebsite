import { describe, expect, it } from 'vitest'
import { mergeCollection, type Deck, type Card, validateDeck } from './deck'

describe('audit regressions: inventory quantity safety and Commander validation', () => {
  it('rejects malformed inventory quantities rather than persisting invalid counts', () => {
    expect(() => mergeCollection({ card: 1 }, { card: 0 })).toThrow(/Invalid quantity/)
    expect(() => mergeCollection({}, { card: -2 })).toThrow(/Invalid quantity/)
    expect(() => mergeCollection({}, { card: 1.5 })).toThrow(/Invalid quantity/)
    expect(() => mergeCollection({ card: Number.MAX_SAFE_INTEGER }, { card: 1 })).toThrow(/safe integer/)
  })

  it('refuses non-basic duplicate cards even if split across duplicate deck rows', () => {
    const cards: Card[] = [
      { id: 'c', name: 'Captain', typeLine: 'Legendary Creature', colorIdentity: [], manaValue: 0, commanderLegal: true, roles: ['commander'] },
      { id: 'r', name: 'Relic', typeLine: 'Artifact', colorIdentity: [], manaValue: 1, commanderLegal: true, roles: ['flex'] },
    ]
    const deck: Deck = { commanderId: 'c', cards: [{ cardId: 'c', quantity: 1 }, { cardId: 'r', quantity: 1 }, { cardId: 'r', quantity: 1 }], complete: false, missing: 97 }
    expect(validateDeck(deck, cards, { c: 1, r: 2 }).some((issue) => issue.code === 'singleton')).toBe(true)
  })

  it('checks combined inventory against deck allocation instead of checking per-entry copies only', () => {
    const cards: Card[] = [
      { id: 'c', name: 'Captain', typeLine: 'Legendary Creature', colorIdentity: [], manaValue: 0, commanderLegal: true, roles: ['commander'] },
      { id: 'r', name: 'Relic', typeLine: 'Artifact', colorIdentity: [], manaValue: 1, commanderLegal: true, roles: ['flex'] },
    ]
    const deck: Deck = { commanderId: 'c', cards: [{ cardId: 'c', quantity: 1 }, { cardId: 'r', quantity: 2 }], complete: false, missing: 97 }
    expect(validateDeck(deck, cards, { c: 1, r: 1 }).some((issue) => issue.code === 'unowned')).toBe(true)
  })
})
