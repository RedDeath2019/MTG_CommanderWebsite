import { describe, expect, it } from 'vitest'
import {
  collectionFromMoxfieldRows,
  createScryfallIdentifiers,
  looksLikeMoxfieldCsv,
  mergeMoxfieldInventory,
  parseMoxfieldCsv,
  resolveMoxfieldRows,
} from './moxfield'

const HEADER = '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"'
const scryfallSolRing = {
  id: 'print-sol-ring', oracle_id: 'sol-ring', name: 'Sol Ring', type_line: 'Artifact',
  color_identity: [], cmc: 1, legalities: { commander: 'legal' }, set: 'cmm', collector_number: '396',
}
const makeInventoryRow = { tradeCount: 0, name: 'Sol Ring', edition: 'cmm', condition: 'Near Mint', language: 'English', foil: false, tags: '', collectorNumber: '396', alter: false, proxy: false }

describe('Moxfield collection import', () => {
  it('recognizes Moxfield headers and parses quantities, price, finish, and printing metadata', () => {
    const result = parseMoxfieldCsv([HEADER, '"2","0","Sol Ring","cmm","Near Mint","English","foil","","","396","False","False","1.50"'].join('\n'))
    expect(looksLikeMoxfieldCsv(HEADER)).toBe(true)
    expect(result.rows).toEqual([{
      count: 2, tradeCount: 0, name: 'Sol Ring', edition: 'cmm', condition: 'Near Mint',
      language: 'English', foil: true, tags: '', collectorNumber: '396', alter: false, proxy: false, purchasePrice: 1.5,
    }])
    const commaName = parseMoxfieldCsv([HEADER, '1,0,"Name, with comma",cmm,Near Mint,English,,,,396,False,False,'].join('\n'))
    expect(commaName.rows[0].name).toBe('Name, with comma')
    expect(result.errors).toEqual([])
  })

  it('keeps separate purchase prices as distinct inventory lots', () => {
    const result = parseMoxfieldCsv([
      HEADER,
      '1,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,1.25',
      '1,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,2.50',
    ].join('\n'))
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((entry) => entry.purchasePrice)).toEqual([1.25, 2.5])
  })

  it('rejects counts and duplicate aggregate totals outside safe integer range', () => {
    const rowCount = parseMoxfieldCsv([HEADER, '9007199254740992,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,'].join('\n'))
    expect(rowCount.rows).toEqual([])
    expect(rowCount.errors[0]).toMatch(/positive safe whole number/)
    const overflow = parseMoxfieldCsv([HEADER,
      '9007199254740991,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
      '1,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
    ].join('\n'))
    expect(overflow.rows).toEqual([])
    expect(overflow.errors[0]).toMatch(/safe integer/)

    expect(() => mergeMoxfieldInventory(
      [{ count: Number.MAX_SAFE_INTEGER, cardId: 'x', ...makeInventoryRow }],
      [{ count: 1, cardId: 'x', ...makeInventoryRow }],
    )).toThrow(/safe integer/)
  })

  it('aggregates duplicate inventory rows only when printing and finish metadata match', () => {
    const result = parseMoxfieldCsv([
      HEADER,
      '2,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
      '1,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
      '1,0,Sol Ring,cmm,Near Mint,English,foil,,,396,False,False,',
    ].join('\n'))
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => [row.count, row.foil])).toEqual([[3, false], [1, true]])
  })

  it('reports malformed rows and refuses files missing key Moxfield identifiers', () => {
    expect(looksLikeMoxfieldCsv('Name,Count\nSol Ring,1')).toBe(false)
    expect(parseMoxfieldCsv('Name,Count\nSol Ring,1').errors[0]).toMatch(/Moxfield export columns/i)
    const csv = [
      HEADER,
      '0,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
      'two,0,Island,lea,Near Mint,English,,,,290,False,False,',
      '1,0,Unknown,,Near Mint,English,,,,,False,False,',
    ].join('\n')
    const parsed = parseMoxfieldCsv(csv)
    expect(parsed.rows).toEqual([])
    expect(parsed.errors).toHaveLength(3)
  })

  it('rejects rows that do not have the Moxfield column count instead of misassigning printing fields', () => {
    const malformed = [HEADER, '1,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False'].join('\n')
    const parsed = parseMoxfieldCsv(malformed)
    expect(parsed.rows).toEqual([])
    expect(parsed.errors).toEqual(['Row 2: expected 13 columns but found 12.'])
  })

  it('rejects an unreasonable import size before parsing', () => {
    const oversized = `x,${'a'.repeat(20 * 1024 * 1024)}`
    expect(parseMoxfieldCsv(oversized)).toMatchObject({ rows: [], errors: ['This CSV is larger than the 20 MB browser import limit.'] })
  })

  it('resolves duplicate counts while retaining separate condition and finish rows', () => {
    const source = parseMoxfieldCsv([
      HEADER,
      '1,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
      '2,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
      '1,0,Sol Ring,cmm,Lightly Played,English,,,,396,False,False,',
      '1,0,Sol Ring,cmm,Near Mint,Japanese,foil,,,396,False,False,',
    ].join('\n'))
    const resolved = resolveMoxfieldRows(source.rows, [scryfallSolRing]).rows
    expect(createScryfallIdentifiers(source.rows)).toEqual([{ set: 'cmm', collector_number: '396' }])
    expect(resolved).toHaveLength(3)
    expect(collectionFromMoxfieldRows(resolved)).toEqual({ 'sol-ring': 5 })
  })

  it('looks up distinct set/collector identifiers and resolves matching printings', () => {
    const rows = parseMoxfieldCsv([HEADER,
      '2,0,Sol Ring,cmm,Near Mint,English,,,,396,False,False,',
      '1,0,Sol Ring,cmm,Near Mint,English,foil,,,396,False,False,',
    ].join('\n')).rows
    expect(createScryfallIdentifiers(rows)).toEqual([{ set: 'cmm', collector_number: '396' }])
    const resolved = resolveMoxfieldRows(rows, [scryfallSolRing])
    expect(resolved.errors).toEqual([])
    expect(resolved.rows.map((row) => row.cardId)).toEqual(['sol-ring', 'sol-ring'])
    expect(collectionFromMoxfieldRows(resolved.rows)).toEqual({ 'sol-ring': 3 })
  })

  it('keeps mismatched and unresolvable rows out of the collection with explicit errors', () => {
    const rows = parseMoxfieldCsv([HEADER,
      '1,0,Wrong Name,cmm,Near Mint,English,,,,396,False,False,',
      '1,0,Unknown Card,xxx,Near Mint,English,,,,1,False,False,',
    ].join('\n')).rows
    const result = resolveMoxfieldRows(rows, [scryfallSolRing])
    expect(result.rows).toEqual([])
    expect(result.errors).toHaveLength(2)
    expect(collectionFromMoxfieldRows(result.rows)).toEqual({})
  })

  it('does not merge inventory copies across foil, condition, language, tags, trade status, or printing', () => {
    const row = { count: 1, tradeCount: 0, name: 'Sol Ring', edition: 'cmm', condition: 'Near Mint', language: 'English', foil: false, tags: '', collectorNumber: '396', alter: false, proxy: false, cardId: 'sol-ring' }
    const updated = mergeMoxfieldInventory([row], [{ ...row, foil: true }, { ...row, condition: 'Lightly Played' }, { ...row, language: 'Japanese' }, { ...row, tags: 'trade' }, { ...row, tradeCount: 1 }, { ...row, edition: 'lea', collectorNumber: '290' }])
    expect(updated).toHaveLength(7)
    expect(updated.reduce((sum, entry) => sum + entry.count, 0)).toBe(7)
  })
})
