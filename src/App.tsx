import { useMemo, useState } from 'react'
import {
  buildDeck,
  describeRole,
  exportDeckList,
  findOwnedCommanders,
  getCard,
  getRoleCounts,
  getRoleLabel,
  importCollectionCsv,
  sampleCards,
  sampleCollection,
  validateDeck,
  type Collection,
  type Deck,
} from './domain/deck'
import './App.css'

const STORAGE_KEY = 'spellbook-collection-v1'

function loadSavedState(): { collection: Collection; deck: Deck | null; selectedCommander: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as { collection?: Collection; deck?: Deck | null; selectedCommander?: string }
      return {
        collection: parsed.collection ?? sampleCollection,
        deck: parsed.deck ?? null,
        selectedCommander: parsed.selectedCommander ?? 'alela',
      }
    }
  } catch {
    // A malformed local save should not prevent the sample app from starting.
  }
  return { collection: sampleCollection, deck: null, selectedCommander: 'alela' }
}

function App() {
  const [initial] = useState(loadSavedState)
  const [collection, setCollection] = useState<Collection>(initial.collection)
  const [selectedCommander, setSelectedCommander] = useState(initial.selectedCommander)
  const [deck, setDeck] = useState<Deck | null>(initial.deck)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [showImport, setShowImport] = useState(false)
  const [view, setView] = useState<'collection' | 'builder'>('builder')

  const commanders = findOwnedCommanders(sampleCards, collection)
  const selectedCommanderCard = getCard(selectedCommander)
  const buildableCardCount = sampleCards.filter((card) => card.id !== selectedCommander
    && (collection[card.id] ?? 0) > 0
    && card.commanderLegal
    && card.colorIdentity.every((color) => selectedCommanderCard?.colorIdentity.includes(color))).length
  const inventory = useMemo(() => sampleCards
    .filter((card) => (collection[card.id] ?? 0) > 0 && card.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [collection, query])
  const deckIssues = deck ? validateDeck(deck, sampleCards, collection) : []
  const selectedCards = deck?.cards.map((entry) => ({ ...entry, card: getCard(entry.cardId)! })) ?? []
  const roleCounts = deck ? getRoleCounts(deck, sampleCards) : {}

  function saveCollection(next: Collection, message: string) {
    setCollection(next)
    const selectedDeck = deck && next[deck.commanderId] ? deck : null
    if (deck && !selectedDeck) setDeck(null)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ collection: next, deck: selectedDeck, selectedCommander: next[selectedCommander] ? selectedCommander : '' }))
    setNotice(message)
  }

  function generateDeck() {
    try {
      const nextDeck = buildDeck(sampleCards, collection, selectedCommander)
      setDeck(nextDeck)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ collection, deck: nextDeck, selectedCommander }))
      setNotice('A new draft is ready. This draft only uses cards in your collection.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not build this deck.')
    }
  }

  function updateDeck(nextDeck: Deck) {
    setDeck(nextDeck)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ collection, deck: nextDeck, selectedCommander }))
  }

  function removeCard(cardId: string) {
    if (!deck || cardId === deck.commanderId) return
    const target = deck.cards.find((entry) => entry.cardId === cardId)
    if (!target) return
    const card = getCard(cardId)
    const quantity = target.quantity - 1
    const cards = quantity > 0
      ? deck.cards.map((entry) => entry.cardId === cardId ? { ...entry, quantity } : entry)
      : deck.cards.filter((entry) => entry.cardId !== cardId)
    const next = { ...deck, cards }
    next.missing = Math.max(0, 100 - next.cards.reduce((total, entry) => total + entry.quantity, 0))
    next.complete = next.missing === 0
    updateDeck(next)
    if (card && /Basic Land/i.test(card.typeLine) && quantity > 0) setNotice(`Removed one ${card.name} from the draft.`)
  }

  function addCard(cardId: string) {
    if (!deck) return
    const card = getCard(cardId)
    if (!card || (collection[cardId] ?? 0) < 1) return
    const target = deck.cards.find((entry) => entry.cardId === cardId)
    const isBasicLand = /Basic Land/i.test(card.typeLine)
    if (target && !isBasicLand) return
    const currentTotal = deck.cards.reduce((total, entry) => total + entry.quantity, 0)
    if (currentTotal >= 100) return
    const cards = target
      ? deck.cards.map((entry) => entry.cardId === cardId ? { ...entry, quantity: Math.min(entry.quantity + 1, collection[cardId]) } : entry)
      : [...deck.cards, { cardId, quantity: 1 }]
    const next = { ...deck, cards }
    next.missing = Math.max(0, 100 - next.cards.reduce((total, entry) => total + entry.quantity, 0))
    next.complete = next.missing === 0
    updateDeck(next)
  }

  function handleImport(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = importCollectionCsv(String(reader.result ?? ''), sampleCards)
      setImportErrors(result.errors)
      if (Object.keys(result.collection).length > 0) {
        setCollection(result.collection)
        setDeck(null)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ collection: result.collection, deck: null, selectedCommander: '' }))
        setNotice(`Imported ${Object.values(result.collection).reduce((sum, value) => sum + value, 0)} cards from ${file.name}.`)
      } else if (result.errors.length === 0) {
        setNotice('No collection cards were imported.')
      }
      if (result.errors.length === 0) setShowImport(false)
    }
    reader.readAsText(file)
  }

  function chooseCommander(commanderId: string) {
    setSelectedCommander(commanderId)
    setDeck(null)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ collection, deck: null, selectedCommander: commanderId }))
  }

  function exportCollection() {
    const lines = ['name,quantity', ...Object.entries(collection).map(([id, quantity]) => `${getCard(id)?.name ?? id},${quantity}`)]
    downloadFile('spellbook-collection.csv', lines.join('\n'), 'text/csv')
  }

  function exportDeck() {
    if (!deck) return
    downloadFile('commander-deck.txt', exportDeckList(deck, sampleCards), 'text/plain')
  }

  function downloadFile(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function decrement(cardId: string) {
    const quantity = (collection[cardId] ?? 0) - 1
    const next = { ...collection }
    if (quantity < 1) delete next[cardId]
    else next[cardId] = quantity
    saveCollection(next, 'Collection updated.')
  }

  function increment(cardId: string) {
    saveCollection({ ...collection, [cardId]: (collection[cardId] ?? 0) + 1 }, 'Collection updated.')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Spellbook home"><span className="brand-mark">✦</span><span>spellbook</span></a>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === 'collection' ? 'nav-link active' : 'nav-link'} onClick={() => setView('collection')}>My collection</button>
          <button className={view === 'builder' ? 'nav-link active' : 'nav-link'} onClick={() => setView('builder')}>Deck builder</button>
        </nav>
        <div className="profile-chip"><span className="status-dot" /> Local collection <span className="avatar">R</span></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>✧</span> YOUR CARDS. YOUR NEXT DECK.</div>
          <h1>Find the deck<br />hiding in your <em>collection.</em></h1>
          <p>Pick a commander you love. We’ll find a starting point using cards you already own.</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => setView('builder')}>Explore my collection <span>↗</span></button>
            <button className="button button-quiet" onClick={() => setShowImport(true)}>＋ Import collection</button>
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
          <div className="floating-label label-top"><span>✧</span> Your collection, reimagined</div>
          <div className="floating-label label-bottom"><span className="pulse" /> {buildableCardCount} owned cards in this sample can build around</div>
          <div className="mini-star star-one">✧</div><div className="mini-star star-two">✦</div>
        </div>
      </section>

      <section className="stat-row" aria-label="Collection overview">
        <div className="stat"><span className="stat-icon violet">▤</span><div><strong>{Object.values(collection).reduce((sum, count) => sum + count, 0).toLocaleString()}</strong><span>Cards in collection</span></div></div>
        <div className="stat"><span className="stat-icon green">♧</span><div><strong>{commanders.length}</strong><span>Commanders to explore</span></div></div>
        <div className="stat"><span className="stat-icon gold">✧</span><div><strong>{Object.keys(collection).length}</strong><span>Unique cards</span></div></div>
        <div className="stat stat-note"><span>✦</span><span>Built around what<br />you already own.</span></div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-heading">
          <div><div className="eyebrow"><span>01</span> THE FUN PART</div><h2>{view === 'builder' ? 'Choose your commander' : 'Your collection'}</h2><p>{view === 'builder' ? 'Start with a legendary creature you already own.' : 'The cards you have, all in one place.'}</p></div>
          <button className="text-button" onClick={() => setShowImport(true)}>＋ Import cards <span>→</span></button>
        </div>

        {view === 'builder' ? (
          <>
            <div className="commander-grid">
              {commanders.map((card, index) => (
                <button key={card.id} className={`commander-card ${selectedCommander === card.id ? 'selected' : ''}`} onClick={() => chooseCommander(card.id)}>
                  <div className={`commander-art art-${index % 4}`}><div className="card-glow" /><span className="art-symbol">{['✧', '☾', '♧', '✦'][index % 4]}</span><div className="color-pips">{card.colorIdentity.map((color) => <i key={color} className={`pip pip-${color}`} />)}</div></div>
                  <div className="commander-info"><div className="commander-title"><strong>{card.name}</strong>{selectedCommander === card.id && <span className="check">✓</span>}</div><span>{card.typeLine}</span><div className="commander-meta"><span>{card.colorIdentity.join(' · ') || 'Colorless'}</span><span>Owned ×{collection[card.id]}</span></div></div>
                </button>
              ))}
              {commanders.length === 0 && <div className="empty-state">No eligible commanders in this collection yet. Import a collection or add a card in My collection.</div>}
            </div>

            <div className="build-panel">
              <div className="build-icon">✦</div><div className="build-copy"><strong>Ready to see what you can build?</strong><span>We’ll start with your owned cards and show what’s still missing.</span></div><div className="build-controls"><span className="mode-pill"><i /> Balanced starting point</span><button className="button button-primary" onClick={generateDeck}>Build my deck <span>✦</span></button></div>
            </div>

            {deck && <section className="deck-results" aria-live="polite">
              <div className="results-header"><div><div className="eyebrow"><span>02</span> YOUR FIRST DRAFT</div><h2>{getCard(deck.commanderId)?.name}</h2><p>{deck.complete ? '100 cards — complete draft' : `${100 - deck.missing} cards selected · ${deck.missing} more needed`}</p></div><div className="results-actions"><button className="button button-outline" onClick={exportDeck}>Export list ↓</button><button className="button button-primary" onClick={generateDeck}>Regenerate ✦</button></div></div>
                <div className="validation-banner"><span className={deckIssues.length ? 'validation-icon warning' : 'validation-icon'}>{deckIssues.length ? '!' : '✓'}</span><div><strong>{deckIssues.length ? 'Needs attention' : deck.complete ? 'Rules check passed' : 'Owned-card draft · incomplete'}</strong><span>{deckIssues.length ? deckIssues.map((issue) => issue.message).join(' ') : deck.complete ? 'All selected cards pass the current prototype checks.' : 'This draft uses only eligible cards in your sample catalog. Add more owned cards to fill the remaining slots.'}</span></div></div>
                <div className="role-strip">{Object.entries(roleCounts).map(([role, count]) => <div className="role-stat" key={role}><span>{role}</span><strong>{count}</strong></div>)}</div>
                <div className="deck-columns"><div className="deck-list-panel"><div className="panel-title"><strong>Deck cards</strong><span>{deck.cards.length} entries</span></div>{selectedCards.map(({ card, quantity }) => <div className="deck-row" key={card.id}><span className={`role-dot role-${getRoleLabel(card)}`} /><div className="deck-row-name"><strong>{card.name}</strong><span>{getRoleLabel(card)} · {describeRole(getRoleLabel(card))}</span></div><span className="deck-quantity">×{quantity}</span>{card.id !== deck.commanderId && <button aria-label={`Remove ${card.name}`} className="remove-card" onClick={() => removeCard(card.id)}>×</button>}</div>)}</div>
                  <aside className="deck-aside"><div className="panel-title"><strong>From your collection</strong><span>{inventory.length} available</span></div><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards…" /></label><div className="available-list">{inventory.filter((card) => {
                    const entry = deck.cards.find((item) => item.cardId === card.id)
                    return card.id !== deck.commanderId && (!entry || (/Basic Land/i.test(card.typeLine) && entry.quantity < (collection[card.id] ?? 0)))
                  }).map((card) => <div className="available-card" key={card.id}><span className={`role-dot role-${getRoleLabel(card)}`} /><span>{card.name}</span><span className="available-qty">×{collection[card.id]}</span><button aria-label={`Add ${card.name}`} onClick={() => addCard(card.id)}>＋</button></div>)}</div><div className="tip-box"><span>✧</span><p><strong>Why these cards?</strong><br />Cards are selected from what you own, within your commander’s colors, and grouped by their role in a deck.</p></div></aside></div>
              </section>}
            <div className="below-note"><span>✧</span> This is a starting point, not a final list. Make it yours.</div>
          </>
        ) : (
          <div className="collection-view"><div className="collection-tools"><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your cards…" /></label><button className="button button-outline" onClick={exportCollection}>Export collection ↓</button><button className="button button-primary" onClick={() => setShowImport(true)}>Import CSV ＋</button></div><div className="collection-table"><div className="collection-head"><span>Card</span><span>Type / role</span><span>Quantity</span><span>Adjust</span></div>{inventory.map((card) => <div className="collection-row" key={card.id}><strong>{card.name}</strong><span>{card.typeLine} · {getRoleLabel(card)}</span><span>×{collection[card.id]}</span><div className="quantity-control"><button onClick={() => decrement(card.id)} aria-label={`Remove one ${card.name}`}>−</button><button onClick={() => increment(card.id)} aria-label={`Add one ${card.name}`}>＋</button></div></div>)}{inventory.length === 0 && <div className="empty-state">No matching cards. Import a supported CSV or change your search.</div>}</div><p className="privacy-footnote">Your collection is stored locally in this browser. Export a backup before clearing browser data.</p></div>
        )}
      </section>

      <footer className="footer"><a className="brand" href="#top"><span className="brand-mark">✦</span><span>spellbook</span></a><span>Made for the decks you haven't built yet.</span><span>Collection stays on this device</span></footer>

      {notice && <div className="toast" role="status"><span>✦</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}
      {showImport && <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setShowImport(false) }}><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="modal-close" onClick={() => setShowImport(false)} aria-label="Close">×</button><div className="eyebrow"><span>COLLECTION SETUP</span></div><h2 id="import-title">Bring your cards in.</h2><p>Choose a CSV with a card name and quantity column. Your file is read in this browser and isn’t uploaded.</p><div className="csv-example"><span>name,quantity</span><br />Arcane Signet,1<br />Island,8</div><label className="button button-primary file-button">Choose CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => { handleImport(event.target.files?.[0]); if (event.target.files?.[0]) setShowImport(false) }} /></label>{importErrors.length > 0 && <ul className="import-errors">{importErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>}<button className="text-button sample-reset" onClick={() => { saveCollection(sampleCollection, 'Sample collection restored.'); setShowImport(false) }}>Restore sample collection</button></section></div>}
    </main>
  )
}

export default App
