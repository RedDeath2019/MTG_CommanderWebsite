import { describe, expect, it } from 'vitest'
import { parseNamedCollectionCsv, exportCollectionCsv } from './collection'
import { sampleCards, type Card } from './deck'

const oddNameCard: Card = { id: 'odd', name: 'Relic, "One"\nSecond line', typeLine: 'Artifact', colorIdentity: [], manaValue: 1, commanderLegal: true, roles: ['flex'] }

describe('named collection CSV', () => {
  it('exports and round-trips card names with commas, quotes, and embedded newlines', () => {
    const csv = exportCollectionCsv({ odd: 2 }, [oddNameCard])
    expect(parseNamedCollectionCsv(csv, [oddNameCard])).toEqual({ collection: { odd: 2 }, errors: [] })
  })

  it('rejects the import rather than silently dropping malformed or unknown rows', () => {
    const result = parseNamedCollectionCsv('name,quantity\nSol Ring,1\nUnknown Card,2', sampleCards)
    expect(result).toMatchObject({ collection: {}, errors: ['Row 3: unknown card "Unknown Card".'] })
  })

  it('rejects decimals, negatives, blank names, and quantities beyond safe integers', () => {
    const result = parseNamedCollectionCsv([
      'name,quantity',
      'Sol Ring,1.5',
      'Island,-1',
      ',2',
      'Plains,9007199254740992',
    ].join('\n'), sampleCards)
    expect(result.collection).toEqual({})
    expect(result.errors).toHaveLength(4)
  })

  it('parses quoted commas, escaped quotes, BOM, and quoted CRLF fields', () => {
    const csv = '\uFEFFname,quantity\r\n"Relic, ""One""\nSecond line",3\r\n'
    expect(parseNamedCollectionCsv(csv, [oddNameCard])).toEqual({ collection: { odd: 3 }, errors: [] })
  })

  it('reports malformed/unknown rows while preserving other valid rows', () => {
    const result = parseNamedCollectionCsv('name,quantity\nSol Ring,1\nUnknown Card,2\nIsland,8,extra', sampleCards)
    expect(result.collection).toEqual({ 'sol-ring': 1 })
    expect(result.errors).toEqual([
      'Row 3: unknown card "Unknown Card".',
      'Row 4: expected 2 columns but found 3.',
    ])
  })

  it('rejects invalid quote syntax instead of accepting ambiguous fields', () => {
    expect(parseNamedCollectionCsv('name,quantity\n"unterminated,1', sampleCards).errors[0]).toMatch(/unterminated/)
  })
})
