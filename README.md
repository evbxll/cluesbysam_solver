Clues By Sam - Solver Extension (minimal)

What this scaffold contains

- A minimal TypeScript solver core implementing 20-bit bitmask enumeration.
- A tiny regex-first parser for a few example clue patterns.
- A `content.ts` entry that simulates reading the page and logs the `BoardSnapshot` and solver suggestion.

How to build

1. Install dev deps:

```powershell
npm install
```

2. Compile TypeScript:

```powershell
npx tsc
```

3. Load extension in Chrome:
- Open `chrome://extensions` → Developer mode → Load unpacked → select this folder.
- The `manifest.json` refers to `dist/content.js` (compiled from `src/content.ts`).

Notes / next steps
- I implemented core masks and a working solver enumerator and a few regex patterns. You can extend `src/parser.ts` with more patterns.
- To auto-click or integrate UI, update `src/content.ts` to query DOM and apply the suggestions.


