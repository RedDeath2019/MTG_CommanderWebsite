import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createScryfallIdentifiers, parseMoxfieldCsv } from './moxfield'

describe('provided Moxfield collection export', () => {
  it('parses the supplied export and constructs exact printing lookup keys without losing rows', () => {
    const csvPath = resolve('/home/rjhermin/Downloads/collection_66313_2026-09-28T00-49-58-273Z.csv')
    const result = parseMoxfieldCsv(readFileSync(csvPath, 'utf8'))
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(6_037)
    expect(result.rows.reduce((sum, row) => sum + row.count, 0)).toBe(12_136)
    expect(createScryfallIdentifiers(result.rows)).toHaveLength(5_285)
  })
})
