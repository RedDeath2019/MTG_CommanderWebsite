import type { Card } from './deck'
import { mergeCards, normalizeScryfallCard, type ScryfallCardObject } from './scryfall'

export interface MoxfieldRow {
  count: number
  tradeCount: number
  name: string
  edition: string
  condition: string
  language: string
  foil: boolean
  tags: string
  collectorNumber: string
  alter: boolean
  proxy: boolean
  purchasePrice?: number
}

export interface MoxfieldCsvResult {
  rows: MoxfieldRow[]
  errors: string[]
}

export interface ResolvedMoxfieldRow extends MoxfieldRow {
  cardId: string
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const MAX_IMPORT_ROWS = 100_000

function parseCsv(input: string): string[][] {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const csv = input.replace(/^\uFEFF/, '')
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    if (char === '"' && quoted && csv[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && csv[index + 1] === '\n') index += 1
      row.push(field.trim())
      if (row.some((value) => value !== '')) records.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field.trim())
  if (row.some((value) => value !== '')) records.push(row)
  if (quoted) throw new Error('CSV contains an unterminated quoted field.')
  return records
}

function bool(value: string): boolean {
  return /^(true|yes|1)$/i.test(value.trim())
}

export function parseMoxfieldCsv(csv: string): MoxfieldCsvResult {
  if (new TextEncoder().encode(csv).byteLength > MAX_IMPORT_BYTES) {
    return { rows: [], errors: ['This CSV is larger than the 20 MB browser import limit.'] }
  }
  let records: string[][]
  try {
    records = parseCsv(csv)
  } catch (error) {
    return { rows: [], errors: [`CSV could not be parsed: ${error instanceof Error ? error.message : 'invalid CSV'}`] }
  }
  if (records.length < 2) return { rows: [], errors: ['Add a Moxfield header and at least one collection row.'] }
  if (records.length - 1 > MAX_IMPORT_ROWS) return { rows: [], errors: ['This CSV exceeds the 100,000-row browser import limit.'] }

  const headers = records[0].map((header) => header.trim().toLocaleLowerCase())
  const required = ['count', 'name', 'edition', 'collector number']
  if (required.some((header) => !headers.includes(header))) {
    return { rows: [], errors: ['Moxfield export columns are required: Count, Name, Edition, and Collector Number.'] }
  }
  const expectedColumnCount = headers.length
  const column = (name: string) => headers.indexOf(name)
  const get = (record: string[], name: string) => record[column(name)]?.trim() ?? ''
  const uniqueRows = new Map<string, MoxfieldRow>()
  const overflowedKeys = new Set<string>()
  const errors: string[] = []

  records.slice(1).forEach((record, index) => {
    const rowNumber = index + 2
    if (record.length !== expectedColumnCount) {
      errors.push(`Row ${rowNumber}: expected ${expectedColumnCount} columns but found ${record.length}.`)
      return
    }
    const count = Number(get(record, 'count'))
    const name = get(record, 'name')
    const edition = get(record, 'edition').toLocaleLowerCase()
    const collectorNumber = get(record, 'collector number')
    if (!Number.isSafeInteger(count) || count < 1) {
      errors.push(`Row ${rowNumber}: Count must be a positive safe whole number.`)
      return
    }
    if (!name || !edition || !collectorNumber) {
      errors.push(`Row ${rowNumber}: Name, Edition, and Collector Number are required.`)
      return
    }
    const rawPrice = get(record, 'purchase price')
    const purchasePrice = rawPrice ? Number(rawPrice) : undefined
    if (rawPrice && (!Number.isFinite(purchasePrice) || Number(purchasePrice) < 0)) {
      errors.push(`Row ${rowNumber}: Purchase Price must be a non-negative number.`)
      return
    }
    const foilValue = get(record, 'foil')
    const row: MoxfieldRow = {
      count,
      tradeCount: Number(get(record, 'tradelist count')) || 0,
      name,
      edition,
      condition: get(record, 'condition'),
      language: get(record, 'language'),
      foil: /\bfoil\b/i.test(foilValue) && !/non-?foil/i.test(foilValue),
      tags: get(record, 'tags'),
      collectorNumber,
      alter: bool(get(record, 'alter')),
      proxy: bool(get(record, 'proxy')),
      ...(purchasePrice === undefined ? {} : { purchasePrice }),
    }
    const key = JSON.stringify([edition, collectorNumber, row.foil, row.condition, row.language, row.alter, row.proxy, row.tags, row.tradeCount, row.purchasePrice ?? null])
    const existing = uniqueRows.get(key)
    if (existing) {
      const total = existing.count + count
      if (!Number.isSafeInteger(total)) {
        uniqueRows.delete(key)
        overflowedKeys.add(key)
        errors.push(`Row ${rowNumber}: aggregated Count exceeds the safe integer limit.`)
      }
      else existing.count = total
    } else if (!overflowedKeys.has(key)) uniqueRows.set(key, row)
  })
  return { rows: [...uniqueRows.values()], errors }
}

export function createScryfallIdentifiers(rows: MoxfieldRow[]): Array<{ set: string; collector_number: string }> {
  return [...new Map(rows.map((row) => [`${row.edition}\u0000${row.collectorNumber}`, {
    set: row.edition,
    collector_number: row.collectorNumber,
  }])).values()]
}

export function resolveMoxfieldRows(rows: MoxfieldRow[], printings: ScryfallCardObject[]): { cards: Card[]; rows: ResolvedMoxfieldRow[]; errors: string[] } {
  const byPrinting = new Map(printings.map((card) => [`${card.set?.toLowerCase()}\u0000${card.collector_number}`, card]))
  const cards: Card[] = []
  const resolvedRows: ResolvedMoxfieldRow[] = []
  const errors: string[] = []
  for (const row of rows) {
    const printing = byPrinting.get(`${row.edition}\u0000${row.collectorNumber}`)
    if (!printing) {
      errors.push(`No Scryfall printing found for ${row.name} (${row.edition} #${row.collectorNumber}).`)
      continue
    }
    if (printing.name.trim().toLowerCase() !== row.name.trim().toLowerCase()) {
      errors.push(`Name mismatch for ${row.edition} #${row.collectorNumber}: export has "${row.name}"; catalog has "${printing.name}".`)
      continue
    }
    const card = normalizeScryfallCard(printing)
    cards.push(card)
    resolvedRows.push({ ...row, cardId: card.id })
  }
  return { cards: mergeCards([], cards), rows: resolvedRows, errors }
}

export function collectionFromMoxfieldRows(rows: ResolvedMoxfieldRow[]): Record<string, number> {
  const collection: Record<string, number> = {}
  for (const row of rows) {
    if (!Number.isSafeInteger(row.count) || row.count < 1) throw new Error(`Invalid imported count for ${row.name}.`)
    const total = (collection[row.cardId] ?? 0) + row.count
    if (!Number.isSafeInteger(total)) throw new Error(`Imported quantity for ${row.name} exceeds the safe integer limit.`)
    collection[row.cardId] = total
  }
  return collection
}

export function moxfieldInventoryKey(row: ResolvedMoxfieldRow): string {
  return JSON.stringify([row.cardId, row.edition, row.collectorNumber, row.foil, row.condition, row.language, row.alter, row.proxy, row.tags, row.tradeCount, row.purchasePrice ?? null])
}

export function mergeMoxfieldInventory(current: ResolvedMoxfieldRow[], incoming: ResolvedMoxfieldRow[]): ResolvedMoxfieldRow[] {
  const merged = new Map(current.map((row) => [moxfieldInventoryKey(row), { ...row }]))
  for (const row of incoming) {
    const key = moxfieldInventoryKey(row)
    const existing = merged.get(key)
    if (existing) {
      const total = existing.count + row.count
      if (!Number.isSafeInteger(total)) throw new Error(`Inventory quantity for ${row.name} exceeds the safe integer limit.`)
      existing.count = total
    }
    else merged.set(key, { ...row })
  }
  return [...merged.values()]
}

export async function lookupMoxfieldPrintings(
  rows: MoxfieldRow[],
  signal?: AbortSignal,
  onProgress?: (resolved: number, total: number) => void,
  requestDelayMs = 500,
): Promise<{ cards: ScryfallCardObject[]; errors: string[] }> {
  const identifiers = createScryfallIdentifiers(rows)
  const cards: ScryfallCardObject[] = []
  const errors: string[] = []
  if (!identifiers.length) return { cards, errors }
  for (let offset = 0; offset < identifiers.length; offset += 75) {
    if (signal?.aborted) throw new DOMException('The card lookup was aborted.', 'AbortError')
    const batch = identifiers.slice(offset, offset + 75)
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch }),
      signal,
    })
    const payload = await response.json() as { data?: ScryfallCardObject[]; not_found?: Array<{ set?: string; collector_number?: string }>; details?: string }
    if (!response.ok) throw new Error(payload.details ?? `Card lookup failed (${response.status}).`)
    cards.push(...(payload.data ?? []))
    for (const missing of payload.not_found ?? []) errors.push(`No catalog match for ${missing.set ?? '?'} #${missing.collector_number ?? '?'}.`)
    onProgress?.(Math.min(offset + batch.length, identifiers.length), identifiers.length)
    if (offset + 75 < identifiers.length) await new Promise((resolve) => setTimeout(resolve, requestDelayMs))
  }
  return { cards, errors }
}

export function looksLikeMoxfieldCsv(csv: string): boolean {
  try {
    const first = parseCsv(csv)[0] ?? []
    const headers = first.map((header) => header.toLowerCase())
    return headers.includes('tradelist count') && headers.includes('edition') && headers.includes('collector number')
  } catch {
    return false
  }
}
