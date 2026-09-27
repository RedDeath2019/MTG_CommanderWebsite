# Spellbook — collection-first Commander builder

A local-first prototype for finding a Commander deck in the cards you already own.

## Run locally

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Prototype scope

This local-first prototype is the first connected MTG toolkit slice: a Scryfall-backed card catalog, shared collection inventory, newly unlocked Commander discovery, one active deck draft, a local saved-deck library, plain-text deck-list import, CSV inventory import/export, and editable deck lists. Add a card and review whether it might fit the current deck; suggestions never silently modify saved lists. Camera scanning and multi-device/account sync are future work. Data is stored in this browser's localStorage.

CSV shape:

```csv
name,quantity
Arcane Signet,1
Island,8
```

Headers accepted for name: `name`, `card`, `card name`; quantity: `quantity`, `count`, `qty`. Imports add to the existing inventory and report unresolved names/invalid quantities. The catalog uses Scryfall search results and a local cache; CSV names must match a card already available in the browser catalog/sample data. Printing-level inventory and alternate-name matching are future improvements.

## Commands

```bash
npm test       # domain behavior tests
npm run lint   # lint
npm run build  # TypeScript check and production build
```

## Deck lists and saved decks

On the Decks view, decks can be saved with a name in this browser, reopened, updated, deleted, and exported. Use “Import deck list” to paste a plain-text list with a `Commander: Card Name` line and `quantity Card Name` entries. Imported card names must be available in the currently loaded catalog; unresolved entries are reported for correction. A new device does not see these browser-local saved decks unless you separately export/share the list.

## Important limitations

This is not yet a production deck builder or authoritative rules checker. The catalog search is live through Scryfall, while built-in demo card records and heuristic role tags remain illustrative. Legality can become stale and Commander partner/background and other edge cases are incomplete. Deck fit messages check only broad color-identity compatibility; they are not tested upgrade recommendations. Collection and saved deck data are browser-local; export backups before clearing browser data.

Before integrating a real card source, review its current API terms, bulk-data policies, caching/rate limits, and attribution requirements. Then expand validator fixtures against a versioned rules/ban-list input before presenting drafts as rules-legal.

## Product proposal

The detailed MVP proposal is at `../.hermes/plans/2026-09-27_050825-mtg-collection-deckbuilder-mvp.md`.

## License/data note

This prototype is not affiliated with or endorsed by Wizards of the Coast. Card names are illustrative demo data. Verify applicable trademarks, data-provider terms, and legal requirements before public launch.

Magic: The Gathering is property of Wizards of the Coast LLC.
```