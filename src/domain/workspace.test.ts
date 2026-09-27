import { describe, expect, it } from 'vitest'
import { deleteSavedDeck, parseDeckList, upsertSavedDeck, type SavedDeck } from './workspace'
import type { Deck } from './deck'

const sampleDeck: Deck = {
  commanderId: 'alela',
  cards: [{ cardId: 'alela', quantity: 1 }],
  complete: false,
  missing: 99,
}

const saved: SavedDeck[] = [
  { id: 'deck-1', name: 'Faerie Tokens', deck: sampleDeck, updatedAt: '2026-01-01T00:00:00.000Z' },
]

describe('saved decks', () => {
  it('adds a named deck to the saved deck list', () => {
    expect(upsertSavedDeck([], { id: 'deck-1', name: '  Faerie Tokens ', deck: sampleDeck, updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toEqual([{ id: 'deck-1', name: 'Faerie Tokens', deck: sampleDeck, updatedAt: '2026-01-01T00:00:00.000Z' }])
  })

  it('updates an existing deck in place without creating a duplicate', () => {
    const edited = { ...sampleDeck, missing: 98 }
    const result = upsertSavedDeck(saved, { id: 'deck-1', name: 'Faerie Tokens', deck: edited, updatedAt: '2026-02-01T00:00:00.000Z' })
    expect(result).toHaveLength(1)
    expect(result[0].deck.missing).toBe(98)
  })

  it('removes only the requested saved deck', () => {
    const second = { id: 'deck-2', name: 'Other', deck: sampleDeck, updatedAt: '2026-01-02T00:00:00.000Z' }
    expect(deleteSavedDeck([...saved, second], 'deck-1')).toEqual([second])
  })

  it('rejects a blank saved deck name', () => {
    expect(() => upsertSavedDeck([], { id: 'deck-1', name: '  ', deck: sampleDeck, updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toThrow('Give this deck a name before saving.')
  })

  it('parses Commander text lists, aggregates duplicate cards, and reports unknown names', () => {
    const result = parseDeckList(['Commander: Alela, Artful Provocateur', '1 Sol Ring (CMM) 396', '2 Island', '1 Unknown Card'].join('\n'), [
      { id: 'alela', name: 'Alela, Artful Provocateur' },
      { id: 'sol-ring', name: 'Sol Ring' },
      { id: 'island', name: 'Island' },
    ])
    expect(result.commanderId).toBe('alela')
    expect(result.entries).toEqual([
      { cardId: 'sol-ring', quantity: 1 },
      { cardId: 'island', quantity: 2 },
    ])
    expect(result.errors).toEqual(['Line 4: card not found in the current catalog: "Unknown Card".'])
  })

  it('imports a commander from a typical list with set code and collector number suffixes', () => {
    const result = parseDeckList([
      'Commander: Alela, Artful Provocateur',
      '1 Alela, Artful Provocateur (ELD) 324',
      '1 Sol Ring (CMM) 396',
    ].join('\n'), [
      { id: 'alela', name: 'Alela, Artful Provocateur' },
      { id: 'sol-ring', name: 'Sol Ring' },
    ])
    expect(result.commanderId).toBe('alela')
    expect(result.entries).toEqual([{ cardId: 'alela', quantity: 1 }, { cardId: 'sol-ring', quantity: 1 }])
    expect(result.errors).toEqual([])
  })
})
