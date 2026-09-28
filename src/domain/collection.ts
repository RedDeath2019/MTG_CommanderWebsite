import type { Card, Collection } from './deck'

function parseCsvRecords(input: string): string[][] {
  const csv = input.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let afterQuote = false
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i]
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
        afterQuote = true
      } else field += char
      continue
    }
    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n' && !/\s/.test(char)) {
      throw new Error('Unexpected character after a quoted CSV field.')
    }
    if (char === '"') {
      if (field.trim()) throw new Error('Unexpected quote inside an unquoted CSV field.')
      field = ''
      quoted = true
      afterQuote = false
    } else if (char === ',') {
      row.push(field.trim())
      field = ''
      afterQuote = false
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && csv[i + 1] === '\n') i += 1
      row.push(field.trim())
      if (row.some((cell) => cell !== '')) records.push(row)
      row = []
      field = ''
      afterQuote = false
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.')
  row.push(field.trim())
  if (row.some((cell) => cell !== '')) records.push(row)
  return records
}

function encodeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function exportCollectionCsv(collection: Collection, cards: Card[]): string {
  const byId = new Map(cards.map((card) => [card.id, card]))
  const rows = ['name,quantity']
  for (const [id, quantity] of Object.entries(collection)) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(`Invalid quantity for ${id}.`)
    rows.push(`${encodeCsvField(byId.get(id)?.name ?? id)},${quantity}`)
  }
  return rows.join('\r\n')
}

export function parseNamedCollectionCsv(input: string, cards: Card[]): { collection: Collection; errors: string[] } {
  const collection: Collection = {}
  const errors: string[] = []
  let records: string[][]
  try {
    records = parseCsvRecords(input)
  } catch (error) {
    return { collection, errors: [error instanceof Error ? error.message : 'CSV is malformed.'] }
  }
  if (records.length < 2) return { collection, errors: ['Add a header and at least one collection row.'] }
  const headers = records[0].map((header) => header.toLocaleLowerCase())
  const nameIndex = headers.findIndex((header) => ['name', 'card', 'card name'].includes(header))
  const quantityIndex = headers.findIndex((header) => ['quantity', 'count', 'qty'].includes(header))
  if (nameIndex < 0 || quantityIndex < 0) return { collection, errors: ['CSV needs a name/card column and a quantity/count column.'] }
  const byName = new Map(cards.map((card) => [card.name.trim().toLocaleLowerCase(), card.id]))
  const totals = new Map<string, number>()
  records.slice(1).forEach((record, index) => {
    const rowNumber = index + 2
    if (record.length !== headers.length) {
      errors.push(`Row ${rowNumber}: expected ${headers.length} columns but found ${record.length}.`)
      return
    }
    const name = record[nameIndex].trim()
    const quantity = Number(record[quantityIndex])
    const id = byName.get(name.toLocaleLowerCase())
    if (!name) errors.push(`Row ${rowNumber}: card name is blank.`)
    else if (!id) errors.push(`Row ${rowNumber}: unknown card "${name}".`)
    else if (!Number.isSafeInteger(quantity) || quantity < 1) errors.push(`Row ${rowNumber}: quantity must be a positive whole number.`)
    else {
      const total = (totals.get(id) ?? 0) + quantity
      if (!Number.isSafeInteger(total)) errors.push(`Row ${rowNumber}: total quantity for "${name}" exceeds the safe integer limit.`)
      else totals.set(id, total)
    }
  })
  for (const [id, total] of totals) collection[id] = total
  return { collection, errors }
}
