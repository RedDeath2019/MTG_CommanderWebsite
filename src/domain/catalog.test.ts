import { describe, expect, it } from 'vitest'
import { getCatalogCard, searchCatalog } from './catalog'
import { sampleCards } from './deck'

describe('local catalog search', () => {
  it('searches the sample fixture case-insensitively by card name', () => {
    expect(searchCatalog('alela', sampleCards).map((card) => card.id)).toEqual(['alela'])
  })

  it('searches type line and rules text fields', () => {
    expect(searchCatalog('faerie', sampleCards).map((card) => card.id)).toContain('alela')
    expect(searchCatalog('other creatures you control', sampleCards).map((card) => card.id)).toContain('alela')
  })

  it('returns no results for a blank search and looks up by id', () => {
    expect(searchCatalog('  ', sampleCards)).toEqual([])
    expect(getCatalogCard('sol-ring', sampleCards)?.name).toBe('Sol Ring')
  })
})

describe('card catalog provider behavior', () => {
  it('does not make remote requests for empty or too-short queries', async () => {
    const provider = { search: async () => { throw new Error('should not be called') } }
    const { CachedCardCatalog } = await import('./catalog')
    const cached = new CachedCardCatalog(provider)
    expect(await cached.search(' ')).toEqual([])
    expect(await cached.search('a')).toEqual([])
  })

  it('reuses cached card results for the same normalized query', async () => {
    let calls = 0
    let time = 1_000
    const provider = { search: async () => { calls += 1; return sampleCards.slice(0, 1) } }
    const { CachedCardCatalog } = await import('./catalog')
    const cached = new CachedCardCatalog(provider, { now: () => time, intervalMs: 0 })
    expect(await cached.search('Alela')).toHaveLength(1)
    time += 100
    expect(await cached.search(' alela ')).toHaveLength(1)
    expect(calls).toBe(1)
  })

  it('serializes concurrent distinct searches so the provider rate limit is respected', async () => {
    let time = 1_000
    const starts: number[] = []
    const provider = { search: async (query: string) => { starts.push(time); return [{ ...sampleCards[0], name: query }] } }
    const { CachedCardCatalog } = await import('./catalog')
    const cached = new CachedCardCatalog(provider, {
      intervalMs: 500,
      now: () => time,
      sleep: async (duration) => { time += duration },
    })
    await Promise.all([cached.search('Alela'), cached.search('Sol Ring'), cached.search('Island')])
    expect(starts).toEqual([1_000, 1_500, 2_000])
  })
})
