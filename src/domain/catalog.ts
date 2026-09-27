import { sampleCards, type Card } from './deck'
import { type ScryfallCardObject, normalizeScryfallCard } from './scryfall'

export function searchCatalog(query: string, cards: Card[] = sampleCards): Card[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return []
  return cards.filter((card) => {
    const haystack = `${card.name} ${card.typeLine} ${card.oracleText ?? ''}`.toLocaleLowerCase()
    return haystack.includes(normalizedQuery)
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function getCatalogCard(cardId: string, cards: Card[] = sampleCards): Card | undefined {
  return cards.find((card) => card.id === cardId)
}

export interface ScryfallSearchResponse {
  data?: ScryfallCardObject[]
  details?: string
  total_cards?: number
  has_more?: boolean
  next_page?: string
}

export interface CardCatalogProvider {
  search(query: string, signal?: AbortSignal): Promise<Card[]>
}

export const localCatalog: CardCatalogProvider = {
  async search(query) {
    return searchCatalog(query)
  },
}

export const scryfallCatalog: CardCatalogProvider = {
  async search(query, signal) {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) return []
    const params = new URLSearchParams({ q: trimmedQuery, unique: 'cards', order: 'name' })
    const response = await fetch(`https://api.scryfall.com/cards/search?${params}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
    const payload = await response.json() as ScryfallSearchResponse
    if (!response.ok) throw new Error(payload.details ?? `Card search failed (${response.status}).`)
    return (payload.data ?? []).map(normalizeScryfallCard)
  },
}

export class CachedCardCatalog implements CardCatalogProvider {
  private readonly cache = new Map<string, { expiresAt: number; cards: Card[] }>()
  private lastSearchStartedAt = 0
  private readonly intervalMs: number
  private readonly cacheDurationMs: number
  private readonly now: () => number
  private readonly sleep: (durationMs: number, signal?: AbortSignal) => Promise<void>
  private readonly provider: CardCatalogProvider
  private queue: Promise<void> = Promise.resolve()

  constructor(
    provider: CardCatalogProvider,
    options: {
      intervalMs?: number
      cacheDurationMs?: number
      now?: () => number
      sleep?: (durationMs: number, signal?: AbortSignal) => Promise<void>
    } = {},
  ) {
    this.provider = provider
    this.intervalMs = options.intervalMs ?? 550
    this.cacheDurationMs = options.cacheDurationMs ?? 24 * 60 * 60 * 1000
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? wait
  }

  async search(query: string, signal?: AbortSignal): Promise<Card[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (normalizedQuery.length < 2) return []
    const cached = this.cache.get(normalizedQuery)
    if (cached && cached.expiresAt > this.now()) return cached.cards

    const runSearch = async (): Promise<Card[]> => {
      const delay = Math.max(0, this.intervalMs - (this.now() - this.lastSearchStartedAt))
      if (delay) await this.sleep(delay, signal)
      if (signal?.aborted) throw new DOMException('The search was aborted.', 'AbortError')
      this.lastSearchStartedAt = this.now()
      const cards = await this.provider.search(query.trim(), signal)
      this.cache.set(normalizedQuery, { cards, expiresAt: this.now() + this.cacheDurationMs })
      return cards
    }
    const result = this.queue.then(runSearch)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}

function wait(durationMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The search was aborted.', 'AbortError'))
      return
    }
    const timeout = setTimeout(resolve, durationMs)
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new DOMException('The search was aborted.', 'AbortError'))
    }, { once: true })
  })
}