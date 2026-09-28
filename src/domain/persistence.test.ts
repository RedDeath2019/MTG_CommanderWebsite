import { describe, expect, it } from 'vitest'
import { defaultSavedState, loadSavedState, serializeSavedState } from './persistence'

describe('local persistence', () => {
  it('loads a saved collection and its valid decks', () => {
    const state = defaultSavedState()
    const serialized = serializeSavedState({ ...state, collection: { alela: 1 }, selectedCommander: 'alela' })
    expect(loadSavedState(serialized)).toMatchObject({ collection: { alela: 1 }, selectedCommander: 'alela' })
  })

  it('falls back to a safe default if stored inventory has invalid quantities', () => {
    const state = { ...defaultSavedState(), collection: { alela: 0 } }
    expect(loadSavedState(JSON.stringify(state)).collection).toEqual(defaultSavedState().collection)
  })

  it('drops saved decks that reference absent cards and invalid active identifiers', () => {
    const saved = { ...defaultSavedState(), savedDecks: [{ id: 'broken', name: 'Broken', updatedAt: 'date', deck: { commanderId: 'missing', cards: [{ cardId: 'missing', quantity: 1 }], complete: false, missing: 99 } }], activeSavedDeckId: 'broken' }
    const loaded = loadSavedState(JSON.stringify(saved))
    expect(loaded.savedDecks).toEqual([])
    expect(loaded.activeSavedDeckId).toBe('')
  })

  it('retains valid stored cards, active commander, and matching saved deck', () => {
    const saved = {
      ...defaultSavedState(),
      collection: { alela: 1 },
      savedDecks: [{ id: 'alela-list', name: 'Alela list', updatedAt: '2026-01-01', deck: { commanderId: 'alela', cards: [{ cardId: 'alela', quantity: 1 }], complete: false, missing: 99 } }],
      activeSavedDeckId: 'alela-list',
    }
    const loaded = loadSavedState(JSON.stringify(saved))
    expect(loaded.cards.some((card) => card.id === 'alela')).toBe(true)
    expect(loaded.savedDecks).toHaveLength(1)
    expect(loaded.activeSavedDeckId).toBe('alela-list')
  })

  it('recovers from malformed JSON without throwing', () => {
    expect(loadSavedState('{not-json').collection).toEqual(defaultSavedState().collection)
  })
})
