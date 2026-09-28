import type { Card, Collection, Deck } from './deck'
import { sampleCards, sampleCollection } from './deck'
import { mergeCards } from './scryfall'
import type { ResolvedMoxfieldRow } from './moxfield'
import type { SavedDeck } from './workspace'

export const STORAGE_KEY = 'spellbook-collection-v1'

export interface SavedState {
  collection: Collection
  deck: Deck | null
  selectedCommander: string
  cards: Card[]
  savedDecks: SavedDeck[]
  activeSavedDeckId: string
  moxfieldInventory: ResolvedMoxfieldRow[]
}

export function defaultSavedState(): SavedState {
  return { collection: sampleCollection, deck: null, selectedCommander: 'alela', cards: sampleCards, savedDecks: [], activeSavedDeckId: '', moxfieldInventory: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validCollection(value: unknown): value is Collection {
  return isRecord(value) && Object.entries(value).every(([id, quantity]) => id.length > 0 && Number.isSafeInteger(quantity) && Number(quantity) > 0)
}

function validDeck(value: unknown): value is Deck {
  return isRecord(value) && typeof value.commanderId === 'string' && Array.isArray(value.cards)
    && value.cards.every((entry) => isRecord(entry) && typeof entry.cardId === 'string' && Number.isSafeInteger(entry.quantity) && Number(entry.quantity) > 0)
    && typeof value.complete === 'boolean' && Number.isSafeInteger(value.missing) && Number(value.missing) >= 0
}

export function loadSavedState(raw: string | null): SavedState {
  const fallback = defaultSavedState()
  if (!raw) return fallback
  try {
    const saved: unknown = JSON.parse(raw)
    if (!isRecord(saved) || !validCollection(saved.collection)) return fallback
    const cards: Card[] = Array.isArray(saved.cards) ? mergeCards(sampleCards, saved.cards.filter(isCard)) : sampleCards
    const cardIds = new Set(cards.map((card) => card.id))
    const savedDecks = Array.isArray(saved.savedDecks) ? saved.savedDecks.filter((item): item is SavedDeck =>
      isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim().length > 0
      && validDeck(item.deck) && typeof item.updatedAt === 'string' && item.deck.cards.every((entry) => cardIds.has(entry.cardId))) : []
    const deck = validDeck(saved.deck) && saved.deck.cards.every((entry) => cardIds.has(entry.cardId))
      && (saved.collection[saved.deck.commanderId] ?? 0) > 0
      ? saved.deck
      : null
    const inventory = Array.isArray(saved.moxfieldInventory) ? saved.moxfieldInventory.filter(isResolvedMoxfieldRow) : []
    const requestedActive = typeof saved.activeSavedDeckId === 'string' ? saved.activeSavedDeckId : ''
    return {
      collection: saved.collection,
      deck,
      selectedCommander: typeof saved.selectedCommander === 'string' && cardIds.has(saved.selectedCommander) ? saved.selectedCommander : fallback.selectedCommander,
      cards,
      savedDecks,
      activeSavedDeckId: savedDecks.some((item) => item.id === requestedActive) ? requestedActive : '',
      moxfieldInventory: inventory,
    }
  } catch {
    return fallback
  }
}

function isCard(value: unknown): value is Card {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.typeLine === 'string'
    && Array.isArray(value.colorIdentity) && value.colorIdentity.every((color) => ['W', 'U', 'B', 'R', 'G'].includes(String(color)))
    && typeof value.manaValue === 'number' && Number.isFinite(value.manaValue) && typeof value.commanderLegal === 'boolean'
    && Array.isArray(value.roles) && value.roles.every((role) => ['commander', 'land', 'ramp', 'draw', 'removal', 'wipe', 'protection', 'synergy', 'flex'].includes(String(role)))
}

function isResolvedMoxfieldRow(value: unknown): value is ResolvedMoxfieldRow {
  return isRecord(value) && Number.isSafeInteger(value.count) && Number(value.count) > 0
    && Number.isSafeInteger(value.tradeCount) && Number(value.tradeCount) >= 0
    && typeof value.name === 'string' && typeof value.edition === 'string' && typeof value.condition === 'string'
    && typeof value.language === 'string' && typeof value.foil === 'boolean' && typeof value.tags === 'string'
    && typeof value.collectorNumber === 'string' && typeof value.alter === 'boolean' && typeof value.proxy === 'boolean'
    && typeof value.cardId === 'string'
}

export function serializeSavedState(state: SavedState): string {
  return JSON.stringify(state)
}
