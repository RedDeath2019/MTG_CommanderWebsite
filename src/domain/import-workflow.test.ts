import { describe, expect, it } from 'vitest'
import { sampleCards, sampleCollection } from './deck'
import type { ResolvedMoxfieldRow } from './moxfield'
import { applyMoxfieldImport } from './import-workflow'

const row: ResolvedMoxfieldRow = {
  count: 2, tradeCount: 0, name: 'Aang', edition: 'tle', condition: 'Near Mint', language: 'English',
  foil: true, tags: '', collectorNumber: '146', alter: false, proxy: false, cardId: 'oracle-aang',
}
const card = { ...sampleCards[1], id: 'oracle-aang', name: 'Aang', typeLine: 'Legendary Creature — Human Avatar', roles: ['commander' as const], commanderLegal: true }

describe('apply Moxfield import', () => {
  it('uses one canonical card ID for same-name catalog records and collection entries', () => {
    const sameNameCard = { ...sampleCards[1], id: 'old-catalog-id', name: 'Aang' }
    const result = applyMoxfieldImport({ cards: [...sampleCards, sameNameCard], collection: sampleCollection, inventory: [] }, [row], [card], 'add')
    expect(result.collection['old-catalog-id']).toBe(2)
    expect(result.collection['oracle-aang']).toBeUndefined()
    expect(result.cards.some((item) => item.id === 'old-catalog-id' && item.name === 'Aang')).toBe(true)
    expect(result.inventory[0].cardId).toBe('old-catalog-id')
  })

  it('merges resolved card records before storing their collection IDs', () => {
    const result = applyMoxfieldImport({ cards: sampleCards, collection: sampleCollection, inventory: [] }, [row], [card], 'add')
    expect(result.collection['oracle-aang']).toBe(2)
    expect(result.cards.some((item) => item.id === 'oracle-aang')).toBe(true)
    expect(result.inventory).toEqual([row])
  })

  it('replaces inventory quantities without losing canonical card records', () => {
    const result = applyMoxfieldImport({ cards: sampleCards, collection: sampleCollection, inventory: [] }, [row], [card], 'replace')
    expect(result.collection).toEqual({ 'oracle-aang': 2 })
    expect(result.cards.some((item) => item.id === 'oracle-aang')).toBe(true)
  })

  it('rejects imports that would create a collection ID without a visible card record', () => {
    expect(() => applyMoxfieldImport({ cards: sampleCards, collection: sampleCollection, inventory: [] }, [row], [], 'add'))
      .toThrow(/catalog entry is missing/)
  })
})
