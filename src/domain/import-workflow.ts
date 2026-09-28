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
  const collection = collectionFromMoxfieldRows(rows)
  for (const row of rows) {
    if (!resolvedCards.some((card) => card.id === row.cardId)) {
      throw new Error(`Resolved card catalog entry is missing for ${row.name} (${row.edition} #${row.collectorNumber}).`)
    }
  }
  return {
    cards: mergeCards(current.cards, resolvedCards),
    collection: mode === 'replace' ? collection : mergeCollection(current.collection, collection),
    inventory: mode === 'replace' ? rows : mergeMoxfieldInventory(current.inventory, rows),
  }
}
