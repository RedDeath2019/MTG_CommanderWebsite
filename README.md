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

This first slice uses an intentionally small built-in sample catalog and sample collection. It demonstrates the product flow: choose an owned commander, generate a deterministic draft from owned cards, inspect role explanations, edit by adding/removing cards, adjust collection quantities, import/export a supported CSV, and keep data in browser localStorage.

CSV shape:

```csv
name,quantity
Arcane Signet,1
Island,8
```

Headers accepted for name: `name`, `card`, `card name`; quantity: `quantity`, `count`, `qty`. The prototype only recognizes cards in its sample catalog. Real collection support requires connecting a complete card-data provider, resolving canonical card identities and printings, and refreshing legality data.

## Commands

```bash
npm test       # domain behavior tests
npm run lint   # lint
npm run build  # TypeScript check and production build
```

## Important limitations

This is not yet a production deck builder or authoritative rules checker. The catalog is sample-only; its legality flags and role tags are illustrative, not a live ban list or complete Oracle data. The current draft algorithm is a transparent starting heuristic, not a deck-quality optimizer. Partner/background/companion rule variants and many Commander exceptions are not implemented. Collection persistence is local to the current browser profile; export a backup before clearing browser data.

Before integrating a real card source, review its current API terms, bulk-data policies, caching/rate limits, and attribution requirements. Then expand validator fixtures against a versioned rules/ban-list input before presenting drafts as rules-legal.

## Product proposal

The detailed MVP proposal is at `../.hermes/plans/2026-09-27_050825-mtg-collection-deckbuilder-mvp.md`.

## License/data note

This prototype is not affiliated with or endorsed by Wizards of the Coast. Card names are illustrative demo data. Verify applicable trademarks, data-provider terms, and legal requirements before public launch.

Magic: The Gathering is property of Wizards of the Coast LLC.
```