import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupMoxfieldPrintings, type MoxfieldRow } from './moxfield'

const makeRows = (count: number): MoxfieldRow[] => Array.from({ length: count }, (_, index) => ({
  count: 1, tradeCount: 0, name: `Card ${index}`, edition: 'set', collectorNumber: String(index + 1),
  condition: 'Near Mint', language: 'English', foil: false, tags: '', alter: false, proxy: false,
}))

describe('Moxfield Scryfall lookup', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('batches distinct printings into at most 75 and reports progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], not_found: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const progress: Array<[number, number]> = []
    await lookupMoxfieldPrintings(makeRows(76), undefined, (resolved, total) => progress.push([resolved, total]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.identifiers).toHaveLength(75)
    expect(progress).toEqual([[75, 76], [76, 76]])
  })

  it('deduplicates repeated card printings before making collection requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], not_found: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const rows = makeRows(1)
    await lookupMoxfieldPrintings([...rows, { ...rows[0], count: 4, foil: true }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).identifiers).toHaveLength(1)
  })
})
