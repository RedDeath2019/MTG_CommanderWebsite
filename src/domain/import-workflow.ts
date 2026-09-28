import type { Card, Collection } from './deck'
import { mergeCollection } from './deck'
import { collectionFromMoxfieldRows, mergeMoxfieldInventory, type ResolvedMoxfieldRow } from './moxfield'
import { mergeCards } from './scryfall'

export interface MoxfieldImportState {
  cards: Card[]
  collection: Collection
  inventory: ResolvedMoxfieldRow[]
}

export function applyMoxfieldImport(
  current: MoxfieldImportState,
  rows: ResolvedMoxfieldRow[],
  resolvedCards: Card[],
  mode: 'replace' | 'add',
): MoxfieldImportState {
  for (const row of rows) {
    if (!resolvedCards.some((card) => card.id === row.cardId)) {
      throw new Error(`Resolved card catalog entry is missing for ${row.name} (${row.edition} #${row.collectorNumber}).`)
    }
  }
  const mergedCards = mergeCards(current.cards, resolvedCards)
  const canonicalIdByIncomingId = new Map(resolvedCards.map((card) => [card.id, mergedCards.find((merged) => merged.name.trim().toLocaleLowerCase() === card.name.trim().toLocaleLowerCase())?.id ?? card.id]))
  const canonicalRows = rows.map((row) => ({ ...row, cardId: canonicalIdByIncomingId.get(row.cardId) ?? row.cardId }))
  const canonicalCollection = collectionFromMoxfieldRows(canonicalRows)
  return {
    cards: mergedCards,
    collection: mode === 'replace' ? canonicalCollection : mergeCollection(current.collection, canonicalCollection),
    inventory: mode === 'replace' ? canonicalRows : mergeMoxfieldInventory(current.inventory, canonicalRows),
  }
}
