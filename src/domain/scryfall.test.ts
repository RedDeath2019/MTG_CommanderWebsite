import { describe, expect, it } from 'vitest'
import { addCardToCollection, decksAffectedByCard, mergeCards, newlyEnabledCommanders, normalizeScryfallCard, resolveCollectionCardId } from './scryfall'
import { sampleCards, type Card } from './deck'

const scryfallFixture = {
  id: 'print-id-123',
  oracle_id: 'oracle-id-123',
  name: 'Tatyova, Benthic Druid',
  type_line: 'Legendary Creature — Merfolk Druid',
  color_identity: ['G', 'U'],
  cmc: 5,
  legalities: { commander: 'legal' },
  oracle_text: 'Whenever a land enters the battlefield under your control, draw a card.',
  set: 'dmu',
  collector_number: '222',
  image_uris: { small: 'https://cards.example/tatyova.jpg' },
}

describe('Scryfall card normalization', () => {
  it('converts a Scryfall object into the shared canonical card model', () => {
    expect(normalizeScryfallCard(scryfallFixture)).toEqual({
      id: 'oracle-id-123',
      name: 'Tatyova, Benthic Druid',
      typeLine: 'Legendary Creature — Merfolk Druid',
      colorIdentity: ['G', 'U'],
      manaValue: 5,
      commanderLegal: true,
      roles: ['commander', 'draw'],
      imageUrl: 'https://cards.example/tatyova.jpg',
      oracleText: 'Whenever a land enters the battlefield under your control, draw a card.',
      setCode: 'dmu',
      collectorNumber: '222',
      scryfallId: 'print-id-123',
      source: 'scryfall',
    })
  })

  it('marks cards that are not Commander legal and assigns a useful role', () => {
    const result = normalizeScryfallCard({
      ...scryfallFixture,
      oracle_id: 'ramp-id',
      type_line: 'Artifact',
      legalities: { commander: 'not_legal' },
      oracle_text: '{T}: Add one mana of any color.',
    })
    expect(result.commanderLegal).toBe(false)
    expect(result.roles).toEqual(['ramp'])
  })

  it('merges catalog entries by canonical card id without duplicating cards', () => {
    const existing: Card = {
      id: 'oracle-id-123', name: 'Tatyova, Benthic Druid', typeLine: 'Legendary Creature — Merfolk Druid',
      colorIdentity: ['G', 'U'], manaValue: 5, commanderLegal: true, roles: ['commander'], source: 'scryfall',
    }
    const refreshed = normalizeScryfallCard({ ...scryfallFixture, set: 'm21', collector_number: '167' })
    const merged = mergeCards([existing], [refreshed])
    expect(merged).toHaveLength(1)
    expect(merged[0].setCode).toBe('m21')
  })

  it('merges another printing of the same card without duplicating its canonical collection entry', () => {
    const existing = { ...normalizeScryfallCard(scryfallFixture), id: 'stable-local-card-id' }
    const reprint = normalizeScryfallCard({ ...scryfallFixture, id: 'print-id-456', oracle_id: null, set: 'm21' })
    const merged = mergeCards([existing], [reprint])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('stable-local-card-id')
    expect(merged[0].setCode).toBe('m21')
  })

  it('finds decks that can use an acquired card based on color identity', () => {
    const card = normalizeScryfallCard({ ...scryfallFixture, color_identity: ['U'] })
    const affected = decksAffectedByCard(card, [
      { name: 'Dimir Reanimator', cardIds: [], colorIdentity: ['U', 'B'] },
      { name: 'Gruul Stompy', cardIds: [], colorIdentity: ['G', 'R'] },
      { name: 'Already Runs It', cardIds: [card.id], colorIdentity: ['U'] },
    ])
    expect(affected).toEqual(['Dimir Reanimator'])
  })

  it('reports commanders newly enabled by newly added inventory', () => {
    const commander = normalizeScryfallCard(scryfallFixture)
    expect(newlyEnabledCommanders({}, { [commander.id]: 1 }, [commander])).toEqual([commander])
    expect(addCardToCollection({}, commander.id)).toEqual({ [commander.id]: 1 })
  })

  it('maps a scanned/reprinted card to an already-owned same-name inventory entry', () => {
    const owned = { ...normalizeScryfallCard(scryfallFixture), id: 'existing-oracle-card', scryfallId: 'older-print-id' }
    const scanned = { ...normalizeScryfallCard(scryfallFixture), id: 'new-id-when-oracle-absent', scryfallId: 'new-print-id' }
    expect(resolveCollectionCardId(scanned, [owned, scanned], { [owned.id]: 1 })).toBe(owned.id)
  })

  it('returns only newly owned commanders from the shared sample catalog after inventory changes', () => {
    const existing = { island: 1 }
    const updated = { ...existing, alela: 1 }
    expect(newlyEnabledCommanders(existing, updated, sampleCards).map((card) => card.id)).toEqual(['alela'])
  })

  it('rejects collection quantity overflow instead of corrupting inventory', () => {
    expect(() => addCardToCollection({ card: Number.MAX_SAFE_INTEGER }, 'card')).toThrow(/safe integer/)
    expect(() => addCardToCollection({}, 'card', Number.MAX_SAFE_INTEGER + 1)).toThrow(/positive whole number/)
  })
})
