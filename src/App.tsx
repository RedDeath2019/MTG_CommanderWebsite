import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import {
  CachedCardCatalog,
  scryfallCatalog,
} from './domain/catalog'
import {
  addCardToCollection,
  decksAffectedByCard,
  mergeCards,
  newlyEnabledCommanders,
  resolveCollectionCardId,
} from './domain/scryfall'
import { deleteSavedDeck, getSavedDeckId, parseDeckList, upsertSavedDeck, type SavedDeck } from './domain/workspace'
import { collectionFromMoxfieldRows, mergeMoxfieldInventory, type ResolvedMoxfieldRow } from './domain/moxfield'
import {
  buildDeck,
  describeRole,
  exportDeckList,
  findOwnedCommanders,
  getRoleCounts,
  getRoleLabel,
  importCollectionCsv,
  mergeCollection,
  sampleCards,
  sampleCollection,
  validateDeck,
  type Card,
  type Collection,
  type Deck,
} from './domain/deck'
import './App.css'
import './catalog.css'
import './workspace.css'
import './decks.css'
import './moxfield.css'

const STORAGE_KEY = 'spellbook-collection-v1'
const cardCatalog = new CachedCardCatalog(scryfallCatalog)
const MoxfieldImportDialog = lazy(() => import('./MoxfieldImportDialog'))

type View = 'collection' | 'builder' | 'catalog'

interface SavedState {
  collection: Collection
  deck: Deck | null
  selectedCommander: string
  cards: Card[]
  savedDecks: SavedDeck[]
  activeSavedDeckId: string
  moxfieldInventory: ResolvedMoxfieldRow[]
}

function loadSavedState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<SavedState>
      return {
        collection: saved.collection ?? sampleCollection,
        deck: saved.deck ?? null,
        selectedCommander: saved.selectedCommander ?? 'alela',
        cards: mergeCards(sampleCards, saved.cards ?? []),
        savedDecks: saved.savedDecks ?? [],
        activeSavedDeckId: saved.activeSavedDeckId ?? '',
        moxfieldInventory: saved.moxfieldInventory ?? [],
      }
    }
  } catch {
    // Keep the app usable if browser storage is unavailable or malformed.
  }
  return { collection: sampleCollection, deck: null, selectedCommander: 'alela', cards: sampleCards, savedDecks: [], activeSavedDeckId: '', moxfieldInventory: [] }
}

function App() {
  const [initial] = useState(loadSavedState)
  const [collection, setCollection] = useState(initial.collection)
  const [cards, setCards] = useState(initial.cards)
  const [deck, setDeck] = useState<Deck | null>(initial.deck)
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(initial.savedDecks)
  const [activeSavedDeckId, setActiveSavedDeckId] = useState(initial.activeSavedDeckId)
  const [moxfieldInventory, setMoxfieldInventory] = useState(initial.moxfieldInventory)
  const [deckName, setDeckName] = useState('')
  const [deckNameError, setDeckNameError] = useState('')
  const [showDeckImport, setShowDeckImport] = useState(false)
  const [deckImportText, setDeckImportText] = useState('')
  const [deckImportErrors, setDeckImportErrors] = useState<string[]>([])
  const [selectedCommander, setSelectedCommander] = useState(initial.selectedCommander)
  const [view, setView] = useState<View>('builder')
  const [collectionQuery, setCollectionQuery] = useState('')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogResults, setCatalogResults] = useState<Card[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [pendingCardId, setPendingCardId] = useState('')
  const [addQuantity, setAddQuantity] = useState(1)
  const [newCommanders, setNewCommanders] = useState<string[]>([])
  const [showImport, setShowImport] = useState(false)
  const [notice, setNotice] = useState('')
  const searchSequence = useRef(0)

  const cardById = (id: string) => cards.find((card) => card.id === id)
  const commanders = findOwnedCommanders(cards, collection)
  const commander = cardById(selectedCommander)
  const inventory = useMemo(() => cards
    .filter((card) => (collection[card.id] ?? 0) > 0 && card.name.toLowerCase().includes(collectionQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [cards, collection, collectionQuery])
  const deckIssues = deck ? validateDeck(deck, cards, collection) : []
  const deckCardRows = deck?.cards.map((entry) => ({ ...entry, card: cardById(entry.cardId) })).filter((entry) => entry.card) ?? []
  const roleCounts = deck ? getRoleCounts(deck, cards) : {}
  const affectedDecks = deck && commander ? [{
    name: commander.name,
    cardIds: deck.cards.map((entry) => entry.cardId),
    colorIdentity: commander.colorIdentity,
  }] : []

  function persist(nextCollection: Collection, nextDeck = deck, nextCommander = selectedCommander, nextCards = cards, nextSavedDecks = savedDecks, nextActiveDeckId = activeSavedDeckId, nextMoxfieldInventory = moxfieldInventory) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        collection: nextCollection,
        deck: nextDeck,
        selectedCommander: nextCommander,
        cards: nextCards,
        savedDecks: nextSavedDecks,
        activeSavedDeckId: nextActiveDeckId,
        moxfieldInventory: nextMoxfieldInventory,
      }))
    } catch {
      setNotice('Browser storage is full or unavailable. Export a collection backup to keep your changes.')
    }
  }

  function updateCollection(next: Collection, message: string) {
    setCollection(next)
    let nextDeck = deck && (next[deck.commanderId] ?? 0) > 0 ? deck : null
    let nextSavedDecks = savedDecks
    if (!nextDeck && deck) {
      nextSavedDecks = savedDecks.map((saved) => saved.id === activeSavedDeckId
        ? { ...saved, deck, updatedAt: new Date().toISOString() }
        : saved)
      setSavedDecks(nextSavedDecks)
      setActiveSavedDeckId('')
    }
    setDeck(nextDeck)
    persist(next, nextDeck, selectedCommander, cards, nextSavedDecks, nextDeck ? activeSavedDeckId : '')
    setNotice(message)
  }

  function decrement(cardId: string) {
    const quantity = (collection[cardId] ?? 0) - 1
    const next = { ...collection }
    if (quantity < 1) delete next[cardId]
    else next[cardId] = quantity
    updateCollection(next, 'Collection updated.')
  }

  function increment(cardId: string) {
    updateCollection(addCardToCollection(collection, cardId), 'Collection updated.')
  }

  function generateDeck() {
    try {
      const nextDeck = buildDeck(cards, collection, selectedCommander)
      setDeck(nextDeck)
      setActiveSavedDeckId('')
      setDeckName('')
      persist(collection, nextDeck, selectedCommander, cards, savedDecks, '')
      setNotice('Draft created from cards in your collection.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not build this deck.')
    }
  }

  function saveCurrentDeck() {
    if (!deck) return
    try {
      const id = activeSavedDeckId || getSavedDeckId(deckName) || `deck-${Date.now()}`
      const updated = upsertSavedDeck(savedDecks, { id, name: deckName, deck, updatedAt: new Date().toISOString() })
      setSavedDecks(updated)
      setActiveSavedDeckId(id)
      persist(collection, deck, deck.commanderId, cards, updated, id)
      setDeckNameError('')
      setNotice('Deck saved to your local deck library.')
    } catch (error) {
      setDeckNameError(error instanceof Error ? error.message : 'Could not save this deck.')
    }
  }

  function openSavedDeck(saved: SavedDeck) {
    setDeck(saved.deck)
    setSelectedCommander(saved.deck.commanderId)
    setActiveSavedDeckId(saved.id)
    setDeckName(saved.name)
    persist(collection, saved.deck, saved.deck.commanderId, cards, savedDecks, saved.id)
    setView('builder')
    setNotice(`Opened ${saved.name}.`)
  }

  function removeSavedDeck(deckId: string) {
    const updated = deleteSavedDeck(savedDecks, deckId)
    const nextActiveId = activeSavedDeckId === deckId ? '' : activeSavedDeckId
    setSavedDecks(updated)
    setActiveSavedDeckId(nextActiveId)
    persist(collection, deck, selectedCommander, cards, updated, nextActiveId)
    setNotice('Saved deck removed from this browser.')
  }

  function importDeckList() {
    const parsed = parseDeckList(deckImportText, cards)
    setDeckImportErrors(parsed.errors)
    if (!parsed.entries.length) return
    const commanderId = parsed.commanderId ?? parsed.entries[0].cardId
    const entries = parsed.entries.filter((entry) => entry.cardId !== commanderId)
    const deckCards = [{ cardId: commanderId, quantity: 1 }, ...entries]
    const total = deckCards.reduce((sum, entry) => sum + entry.quantity, 0)
    const importedDeck: Deck = { commanderId, cards: deckCards, complete: total === 100, missing: Math.max(0, 100 - total) }
    const name = `${cardById(commanderId)?.name ?? 'Imported'} deck`
    const id = getSavedDeckId(name) || `deck-${Date.now()}`
    const updated = upsertSavedDeck(savedDecks, { id, name, deck: importedDeck, updatedAt: new Date().toISOString() })
    setSavedDecks(updated)
    setDeck(importedDeck)
    setSelectedCommander(commanderId)
    setDeckName(name)
    setActiveSavedDeckId(id)
    persist(collection, importedDeck, commanderId, cards, updated, id)
    setShowDeckImport(false)
    setDeckImportText('')
    setView('builder')
    setNotice(`Imported ${name} into your deck library.`)
  }

  function saveEditedDeck(nextDeck: Deck) {
    const total = nextDeck.cards.reduce((sum, entry) => sum + entry.quantity, 0)
    nextDeck.missing = Math.max(0, 100 - total)
    nextDeck.complete = total === 100
    setDeck(nextDeck)
    let nextSavedDecks = savedDecks
    if (activeSavedDeckId) {
      const active = savedDecks.find((saved) => saved.id === activeSavedDeckId)
      if (active) {
        nextSavedDecks = upsertSavedDeck(savedDecks, { ...active, deck: nextDeck, updatedAt: new Date().toISOString() })
        setSavedDecks(nextSavedDecks)
      }
    }
    persist(collection, nextDeck, selectedCommander, cards, nextSavedDecks, activeSavedDeckId)
  }

  function removeDeckCard(cardId: string) {
    if (!deck || cardId === deck.commanderId) return
    const current = deck.cards.find((entry) => entry.cardId === cardId)
    if (!current) return
    const nextCards = current.quantity > 1
      ? deck.cards.map((entry) => entry.cardId === cardId ? { ...entry, quantity: entry.quantity - 1 } : entry)
      : deck.cards.filter((entry) => entry.cardId !== cardId)
    saveEditedDeck({ ...deck, cards: nextCards })
  }

  function addOwnedCardToDeck(cardId: string) {
    if (!deck || (collection[cardId] ?? 0) < 1) return
    const card = cardById(cardId)
    if (!card) return
    const current = deck.cards.find((entry) => entry.cardId === cardId)
    const basicLand = /Basic Land/i.test(card.typeLine)
    if (current && !basicLand) return
    const total = deck.cards.reduce((sum, entry) => sum + entry.quantity, 0)
    if (total >= 100) return
    const nextCards = current
      ? deck.cards.map((entry) => entry.cardId === cardId ? { ...entry, quantity: Math.min(entry.quantity + 1, collection[cardId]) } : entry)
      : [...deck.cards, { cardId, quantity: 1 }]
    saveEditedDeck({ ...deck, cards: nextCards })
  }

  async function searchCards(query: string) {
    setCatalogQuery(query)
    setCatalogError('')
    const requestId = ++searchSequence.current
    if (query.trim().length < 2) {
      setCatalogResults([])
      setCatalogLoading(false)
      return
    }
    setCatalogLoading(true)
    try {
      const results = await cardCatalog.search(query)
      if (requestId !== searchSequence.current) return
      setCards((current) => {
        const merged = mergeCards(current, results)
        persist(collection, deck, selectedCommander, merged)
        return merged
      })
      setCatalogResults(results)
    } catch (error) {
      if (requestId === searchSequence.current) {
        setCatalogError(error instanceof Error ? error.message : 'Card search failed. Please try again.')
        setCatalogResults([])
      }
    } finally {
      if (requestId === searchSequence.current) setCatalogLoading(false)
    }
  }

  function confirmAcquisition(cardId: string) {
    const card = cardById(cardId)
    if (!card) return
    const inventoryId = resolveCollectionCardId(card, cards, collection)
    const updatedCollection = addCardToCollection(collection, inventoryId, addQuantity)
    const unlocked = newlyEnabledCommanders(collection, updatedCollection, cards).map((entry) => entry.name)
    setNewCommanders(unlocked)
    setCollection(updatedCollection)
    persist(updatedCollection)
    setPendingCardId('')
    setAddQuantity(1)
    const deckNames = decksAffectedByCard(card, affectedDecks)
    setNotice(deckNames.length
      ? `Added ${card.name}. It may fit ${deckNames.join(', ')}.`
      : `Added ${addQuantity} × ${card.name} to your collection.`)
  }

  function openImport() {
    setShowImport(true)
  }

  function applyMoxfieldImport(rows: ResolvedMoxfieldRow[], mode: 'replace' | 'add') {
    const imported = collectionFromMoxfieldRows(rows)
    const nextCollection = mode === 'replace' ? imported : mergeCollection(collection, imported)
    const nextInventory = mode === 'replace' ? rows : mergeMoxfieldInventory(moxfieldInventory, rows)
    const unlocked = newlyEnabledCommanders(collection, nextCollection, cards).map((card) => card.name)
    setCollection(nextCollection)
    setMoxfieldInventory(nextInventory)
    setNewCommanders(unlocked)
    persist(nextCollection, deck, selectedCommander, cards, savedDecks, activeSavedDeckId, nextInventory)
    setShowImport(false)
    setNotice(`${mode === 'replace' ? 'Replaced collection with' : 'Added'} ${Object.values(imported).reduce((sum, count) => sum + count, 0).toLocaleString()} cards from Moxfield.`)
  }

  function importLegacyCsv(file: File) {
    void file.text().then((text) => {
      const parsed = importCollectionCsv(text, cards)
      if (parsed.errors.length) {
        setNotice(`Could not import ${file.name}: ${parsed.errors.slice(0, 3).join(' ')}`)
        return
      }
      if (!Object.keys(parsed.collection).length) {
        setNotice(`No recognizable card rows found in ${file.name}.`)
        return
      }
      const updated = mergeCollection(collection, parsed.collection)
      setCollection(updated)
      persist(updated)
      setNotice(`Added ${Object.values(parsed.collection).reduce((sum, count) => sum + count, 0).toLocaleString()} cards from ${file.name}.`)
      setShowImport(false)
    }).catch(() => setNotice(`Could not read ${file.name}.`))
  }

  function chooseCommander(cardId: string) {
    setSelectedCommander(cardId)
    setDeck(null)
    persist(collection, null, cardId)
  }

  function downloadFile(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function exportCollection() {
    const rows = ['name,quantity', ...Object.entries(collection).map(([id, quantity]) => {
      const name = cardById(id)?.name ?? id
      return `"${name.replaceAll('"', '""')}",${quantity}`
    })]
    downloadFile('spellbook-collection.csv', rows.join('\n'), 'text/csv')
  }

  function exportDeck() {
    if (deck) downloadFile('commander-deck.txt', exportDeckList(deck, cards), 'text/plain')
  }


  const totalOwned = Object.values(collection).reduce((sum, count) => sum + count, 0)
  const buildableCount = cards.filter((card) => card.id !== selectedCommander
    && (collection[card.id] ?? 0) > 0
    && card.commanderLegal
    && card.colorIdentity.every((color) => commander?.colorIdentity.includes(color))).length

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Spellbook home"><span className="brand-mark">✦</span><span>spellbook</span></a>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === 'collection' ? 'nav-link active' : 'nav-link'} onClick={() => setView('collection')}>My collection</button>
          <button className={view === 'builder' ? 'nav-link active' : 'nav-link'} onClick={() => setView('builder')}>Decks</button>
          <button className={view === 'catalog' ? 'nav-link active' : 'nav-link'} onClick={() => setView('catalog')}>Cards</button>
        </nav>
        <div className="profile-chip"><span className="status-dot" /> Local collection <span className="avatar">R</span></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>✧</span> YOUR CARDS. YOUR NEXT DECK.</div>
          <h1>Your whole<br />Magic <em>toolkit.</em></h1>
          <p>Keep your cards and decks together. Add a card, then see what it could unlock.</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => setView('builder')}>Explore my decks <span>↗</span></button>
            <button className="button button-quiet" onClick={() => setView('catalog')}>＋ Add cards</button>
          </div>
          <div className="trust-note"><span>◈</span> Your collection stays on this device</div>
        </div>
        <div className="hero-art" aria-label="Decorative magical card illustration">
          <div className="orb orb-one" /><div className="orb orb-two" />
          <div className="art-ring ring-one" /><div className="art-ring ring-two" />
          <div className="feature-card">
            <div className="feature-card-top"><span>LEGENDARY CREATURE</span><span>◉ ◉ ◉</span></div>
            <div className="card-art"><div className="moon" /><div className="tower tower-one" /><div className="tower tower-two" /><div className="faerie">✧</div><div className="spark spark-a">✦</div><div className="spark spark-b">✦</div></div>
            <div className="feature-card-bottom"><strong>Alela, Artful Provocateur</strong><span>W U B</span></div>
          </div>
          <div className="floating-label label-top"><span>✧</span> Your collection, connected</div>
          <div className="floating-label label-bottom"><span className="pulse" /> {buildableCount} compatible owned cards in sample data</div>
          <div className="mini-star star-one">✧</div><div className="mini-star star-two">✦</div>
        </div>
      </section>

      <section className="stat-row" aria-label="Collection overview">
        <div className="stat"><span className="stat-icon violet">▤</span><div><strong>{totalOwned.toLocaleString()}</strong><span>Cards in collection</span></div></div>
        <div className="stat"><span className="stat-icon green">♧</span><div><strong>{commanders.length}</strong><span>Owned commanders</span></div></div>
        <div className="stat"><span className="stat-icon gold">✧</span><div><strong>{Object.keys(collection).length}</strong><span>Unique cards</span></div></div>
        <div className="stat stat-note"><span>✦</span><span>One living collection<br />for all your decks.</span></div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-heading">
          <div><div className="eyebrow"><span>01</span> YOUR MTG TOOLKIT</div><h2>{view === 'builder' ? 'Choose your commander' : view === 'collection' ? 'Your collection' : 'Card catalog'}</h2><p>{view === 'builder' ? 'Build an editable first draft using cards you own.' : view === 'collection' ? 'Your cards, quantities, and collection tools.' : 'Search the card catalog, add inventory, and see potential deck impact.'}</p></div>
          <button className="text-button" onClick={() => view === 'catalog' ? openImport() : setView('catalog')}>{view === 'catalog' ? '＋ Import CSV' : '＋ Add cards'} <span>→</span></button>
        </div>

        {view === 'catalog' ? (
          <div className="catalog-view">
            <div className="catalog-intro"><div><div className="eyebrow"><span>ADD TO YOUR LIVING COLLECTION</span></div><h2>Search cards. See what changes.</h2><p>Find a card, add it to inventory, and see possible deck fits or newly available commanders. Recommendations never modify decks automatically.</p></div><button className="button button-outline" onClick={openImport}>Import collection CSV</button></div>
            <label className="catalog-search search-box"><span>⌕</span><input value={catalogQuery} onChange={(event) => void searchCards(event.target.value)} placeholder="Search any Magic card — e.g. Sol Ring…" aria-label="Search the card catalog" /></label>
            {catalogLoading && <div className="catalog-message">Searching Scryfall card data…</div>}
            {catalogError && <div className="catalog-message error">{catalogError} You can still manage your collection.</div>}
            {catalogQuery.trim().length < 2 && <div className="catalog-message">Type at least two characters to search.</div>}
            <div className="catalog-results">{catalogResults.slice(0, 20).map((card) => {
              const owned = collection[card.id] ?? 0
              const impact = decksAffectedByCard(card, affectedDecks)
              return <article className="catalog-card" key={card.id}>
                {card.imageUrl ? <img src={card.imageUrl} alt={`${card.name} card`} loading="lazy" /> : <div className="catalog-card-placeholder">✧</div>}
                <div className="catalog-card-content"><strong>{card.name}</strong><span>{card.typeLine} · {card.manaValue} mana value · {card.colorIdentity.join('') || 'Colorless'}</span><span>{card.commanderLegal ? 'Commander legal' : 'Not Commander legal'}{card.setCode ? ` · ${card.setCode.toUpperCase()} #${card.collectorNumber ?? ''}` : ''}</span>{owned > 0 && <span className="catalog-owned">In collection ×{owned}</span>}{impact.length > 0 && <span className="catalog-impact">Could fit: {impact.join(', ')}</span>}</div>
                {pendingCardId === card.id ? <div className="acquisition-controls"><input aria-label="Quantity to add" type="number" min="1" max="999" value={addQuantity} onChange={(event) => setAddQuantity(Math.max(1, Number(event.target.value) || 1))} /><button className="button button-primary" onClick={() => confirmAcquisition(card.id)}>Add</button><button className="button button-quiet" onClick={() => setPendingCardId('')}>Cancel</button></div> : <button className="button button-outline catalog-add" onClick={() => { setPendingCardId(card.id); setAddQuantity(1) }}>{owned > 0 ? 'Add copies +' : 'Add to collection +'}</button>}
              </article>
            })}</div>
            {catalogResults.length > 20 && <p className="catalog-message">Showing 20 matches; refine your search.</p>}
            {newCommanders.length > 0 && <div className="catalog-message success"><strong>New commander options unlocked:</strong> {newCommanders.join(', ')}</div>}
            <div className="scanner-panel"><div><div className="eyebrow"><span>SCANNER ROADMAP</span></div><strong>Scan cards with your camera</strong><p>Next milestone: scan → confirm identification → add. Misreads won’t silently alter your collection.</p></div><button className="button button-outline" onClick={() => setNotice('Camera scanning is planned next. Search the catalog or import a CSV for now.')}>▣ Scanner info</button></div>
            <p className="catalog-attribution">Card data and images provided by Scryfall. Unofficial fan application; not affiliated with Wizards of the Coast or Scryfall.</p>
          </div>
        ) : view === 'builder' ? (
          <>
            <section className="saved-decks-panel" aria-label="Saved deck library">
              <div className="saved-decks-heading"><div><strong>My decks</strong><span>{savedDecks.length} saved locally</span></div><div className="saved-deck-actions"><button className="button button-outline" onClick={() => { setDeckImportErrors([]); setDeckImportText(''); setShowDeckImport(true) }}>Import deck list</button><button className="button button-outline" onClick={() => { setDeck(null); setDeckName(''); setActiveSavedDeckId('') }}>New deck</button></div></div>
              {savedDecks.length ? <div className="saved-decks-list">{savedDecks.map((saved) => <article className={`saved-deck-card ${saved.id === activeSavedDeckId ? 'active' : ''}`} key={saved.id}><button className="saved-deck-open" onClick={() => openSavedDeck(saved)}><strong>{saved.name}</strong><span>{cardById(saved.deck.commanderId)?.name ?? 'Commander'} · {saved.deck.cards.reduce((sum, entry) => sum + entry.quantity, 0)}/100 cards</span></button><button className="saved-deck-delete" aria-label={`Delete ${saved.name}`} onClick={() => removeSavedDeck(saved.id)}>×</button></article>)}</div> : <p className="saved-decks-empty">No saved decks yet. Build one below and save it to your local library.</p>}
            </section>
            <div className="commander-grid">
              {commanders.map((card, index) => (
                <button key={card.id} className={`commander-card ${selectedCommander === card.id ? 'selected' : ''}`} onClick={() => chooseCommander(card.id)}>
                  <div className={`commander-art art-${index % 4}`}><div className="card-glow" /><span className="art-symbol">{['✧', '☾', '♧', '✦'][index % 4]}</span><div className="color-pips">{card.colorIdentity.map((color) => <i key={color} className={`pip pip-${color}`} />)}</div></div>
                  <div className="commander-info"><div className="commander-title"><strong>{card.name}</strong>{selectedCommander === card.id && <span className="check">✓</span>}</div><span>{card.typeLine}</span><div className="commander-meta"><span>{card.colorIdentity.join(' · ') || 'Colorless'}</span><span>Owned ×{collection[card.id]}</span></div></div>
                </button>
              ))}
              {commanders.length === 0 && <div className="empty-state">No eligible commanders in this collection yet. Add cards from the catalog or import a CSV.</div>}
            </div>

            <div className="build-panel">
              <div className="build-icon">✦</div><div className="build-copy"><strong>Ready to see what you can build?</strong><span>We’ll start with your owned cards and show what’s still missing.</span></div><div className="build-controls"><span className="mode-pill"><i /> Balanced starting point</span><button className="button button-primary" onClick={generateDeck}>Build my deck <span>✦</span></button></div>
            </div>

            {deck && <section className="deck-results" aria-live="polite">
              <div className="results-header"><div><div className="eyebrow"><span>02</span> YOUR DECK</div><h2>{cardById(deck.commanderId)?.name}</h2><p>{deck.complete ? '100 cards — complete draft' : `${100 - deck.missing} cards selected · ${deck.missing} more needed`}</p></div><div className="results-actions"><button className="button button-outline" onClick={exportDeck}>Export list ↓</button><button className="button button-primary" onClick={generateDeck}>Regenerate ✦</button></div></div>
              <div className="save-deck-bar"><label>Deck name<input value={deckName} onChange={(event) => { setDeckName(event.target.value); setDeckNameError('') }} placeholder={`${cardById(deck.commanderId)?.name ?? 'Commander'} deck`} /></label><button className="button button-primary" onClick={saveCurrentDeck}>{activeSavedDeckId ? 'Update saved deck' : 'Save deck'}</button>{deckNameError && <span className="save-error">{deckNameError}</span>}</div>
              <div className="validation-banner"><span className={deckIssues.length ? 'validation-icon warning' : 'validation-icon'}>{deckIssues.length ? '!' : '✓'}</span><div><strong>{deckIssues.length ? 'Needs attention' : deck.complete ? 'Prototype checks passed' : 'Owned-card draft · incomplete'}</strong><span>{deckIssues.length ? deckIssues.map((issue) => issue.message).join(' ') : deck.complete ? 'Selected cards pass this prototype’s checks. Verify official rules before play.' : 'This draft uses eligible cards in your collection. Add more cards to fill the remaining slots.'}</span></div></div>
              <div className="role-strip">{Object.entries(roleCounts).map(([role, count]) => <div className="role-stat" key={role}><span>{role}</span><strong>{count}</strong></div>)}</div>
              <div className="deck-columns"><div className="deck-list-panel"><div className="panel-title"><strong>Deck cards</strong><span>{deck.cards.length} entries</span></div>{deckCardRows.map(({ card, quantity }) => card && <div className="deck-row" key={card.id}><span className={`role-dot role-${getRoleLabel(card)}`} /><div className="deck-row-name"><strong>{card.name}</strong><span>{getRoleLabel(card)} · {describeRole(getRoleLabel(card))}</span></div><span className="deck-quantity">×{quantity}</span>{card.id !== deck.commanderId && <button aria-label={`Remove ${card.name}`} className="remove-card" onClick={() => removeDeckCard(card.id)}>×</button>}</div>)}</div>
                <aside className="deck-aside"><div className="panel-title"><strong>Owned cards to add</strong><span>{inventory.length} available</span></div><label className="search-box"><span>⌕</span><input value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} placeholder="Search cards…" /></label><div className="available-list">{inventory.filter((card) => {
                  const entry = deck.cards.find((item) => item.cardId === card.id)
                  return card.id !== deck.commanderId && (!entry || (/Basic Land/i.test(card.typeLine) && entry.quantity < (collection[card.id] ?? 0)))
                }).map((card) => <div className="available-card" key={card.id}><span className={`role-dot role-${getRoleLabel(card)}`} /><span>{card.name}</span><span className="available-qty">×{collection[card.id]}</span><button aria-label={`Add ${card.name}`} onClick={() => addOwnedCardToDeck(card.id)}>＋</button></div>)}</div><div className="tip-box"><span>✧</span><p><strong>Why these cards?</strong><br />Cards are owned and inside the commander’s color identity. Recommendations are a starting point—edit them freely.</p></div></aside></div>
            </section>}
          </>
        ) : (
          <div className="collection-view"><div className="collection-tools"><label className="search-box"><span>⌕</span><input value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} placeholder="Search your cards…" /></label><button className="button button-outline" onClick={exportCollection}>Export collection ↓</button><button className="button button-primary" onClick={openImport}>Import CSV ＋</button></div><div className="collection-table"><div className="collection-head"><span>Card</span><span>Type / role</span><span>Quantity</span><span>Adjust</span></div>{inventory.map((card) => <div className="collection-row" key={card.id}><strong>{card.name}</strong><span>{card.typeLine} · {getRoleLabel(card)}</span><span>×{collection[card.id]}</span><div className="quantity-control"><button onClick={() => decrement(card.id)} aria-label={`Remove one ${card.name}`}>−</button><button onClick={() => increment(card.id)} aria-label={`Add one ${card.name}`}>＋</button></div></div>)}{inventory.length === 0 && <div className="empty-state">No matching cards. Search the card catalog or import a supported CSV.</div>}</div><p className="privacy-footnote">Your collection is stored locally in this browser. Export a backup before clearing browser data.</p></div>
        )}
      </section>

      <footer className="footer"><a className="brand" href="#top"><span className="brand-mark">✦</span><span>spellbook</span></a><span>One home for your cards and decks.</span><span>Collection stays on this device</span></footer>

      {notice && <div className="toast" role="status"><span>✦</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}
      {showImport && <Suspense fallback={<div className="moxfield-progress">Loading collection import…</div>}><MoxfieldImportDialog onClose={() => setShowImport(false)} onLegacyImport={importLegacyCsv} onImport={applyMoxfieldImport} /></Suspense>}

      {showDeckImport && <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setShowDeckImport(false) }}><section className="import-modal deck-import-modal" role="dialog" aria-modal="true" aria-labelledby="deck-import-title"><button className="modal-close" onClick={() => setShowDeckImport(false)} aria-label="Close">×</button><div className="eyebrow"><span>DECK LIBRARY</span></div><h2 id="deck-import-title">Import a deck list.</h2><p>Paste a plain text list. Add a “Commander: Card Name” line. Card names must exist in your loaded catalog.</p><textarea value={deckImportText} onChange={(event) => setDeckImportText(event.target.value)} placeholder={'Commander: Alela, Artful Provocateur\n1 Sol Ring\n1 Arcane Signet\n36 Island'} aria-label="Deck list text" /><button className="button button-primary" onClick={importDeckList}>Import into deck library</button>{deckImportErrors.length > 0 && <ul className="import-errors">{deckImportErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>}</section></div>}
    </main>
  )
}

export default App
