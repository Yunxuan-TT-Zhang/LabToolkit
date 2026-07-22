# BenchKit

A suite of wet-lab bench calculators. Static files, no backend, no build step.
All computation happens in the browser; nothing is uploaded anywhere — including
images, which are read with on-device OCR.

## Running it

Open `index.html` in a browser. That is the whole deployment story for the calculators.

For local development with a server:

```
npm start          # serves on http://localhost:8731
```

A server is **required** for two things: installing BenchKit as an app (the service
worker needs http/https, see below) and reliable image OCR (the OCR engine is fetched
cross-origin, which a bare `file://` page can block).

## Installing as a mobile / desktop app (PWA)

BenchKit is a Progressive Web App: `manifest.webmanifest` + `sw.js` + `icons/`.
Once the site is served over **https**, it can be installed to a home screen and runs
offline. There is no App Store build — this is the honest path for a static app.

To publish, drop the folder onto any static host:

- **GitHub Pages** — push the folder to a repo, enable Pages. Done.
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop the folder, or connect the repo.

Then, on the served URL:

- **iPhone / iPad (Safari):** Share → Add to Home Screen
- **Android (Chrome):** ⋮ → Install app
- **Desktop (Chrome / Edge):** install icon in the address bar, or the in-app **Install app** button

Regenerate icons after changing the logo with `npm run icons`.

## Tests

```
npm test            # runs all three suites
npm run test:math   # calculation layer vs published reference values
npm run test:parse  # recipe parser: text -> components -> protocol
npm run test:ui     # boots the real app in jsdom and drives every tool
```

`mathtest.js` checks the domain functions against literature values — ubiquitin,
lysozyme C and both insulin chains for MW / extinction coefficient / pI, plus
monotonicity and round-trip invariants for the Tm, dilution and centrifugation math.
`parsetest.js` covers reagent matching, unit normalisation and amount computation.
`uitest.js` boots the actual page and exercises every tool through DOM events.

All suites must pass before shipping. The pI values agree with ProtParam to within
0.25 pH units, which is the accuracy limit of any pKa-table method.

## What's in it

| Group | Tool |
|---|---|
| Solutions | Molarity & mass, Dilution (C1V1=C2V2), Serial dilution, Percent & stock solutions |
| Protein | A280 concentration, Protein properties from sequence |
| Nucleic acids | Primer Tm, DNA/RNA quantitation |
| Buffers | Buffer recipe scaling, Buffer preparation by pH |
| Bench | Plate layout designer, Centrifuge g↔rpm, Unit converter |
| Recipes | Buffer from image / text, My recipes & protocols |

### Buffer from image / text

Paste (or photograph) a buffer description and BenchKit parses each line into a
structured component — concentration, unit, pH, and a reagent matched to a
~75-entry molecular-weight table — then computes a weigh-out/pipette protocol for a
chosen batch volume. Every field is editable, so a wrong match or a missing MW is a
one-click fix. Images are OCR'd **locally** (Tesseract.js in WebAssembly); the picture
never leaves the device. OCR is best-effort — the parser is the product and works on
typed or pasted text regardless.

### My recipes & protocols

Saved buffer recipes (re-scalable to any volume) and free-text protocols, stored in
`localStorage`. Export/import the whole library as JSON to back it up or move machines.

## How it's put together

- `index.html` — the shell: sidebar, topbar, content mount point.
- `styles.css` — all styling, with a light/dark theme driven by CSS custom properties.
- `app.js` — everything else, in four clearly marked sections:
  1. **Helpers** — number formatting, unit tables, markup builders.
  2. **Reference data** — amino acid masses, pKa sets, nearest-neighbour parameters, buffer table.
     Every table cites its source in a comment.
  3. **Domain calculations** — pure functions, no DOM access. This is the part the math tests import.
  4. **Tools** — one object per calculator with `render()`, `mount()` and `compute()`.

Adding a calculator means adding one entry to `TOOLS`; the nav, routing, persistence
and copy-to-clipboard all pick it up automatically.

### Conventions worth knowing

- Everything is stored internally in SI base units (litres, grams, mol/L) and only
  converted at the display boundary. Add new units to the tables at the top rather
  than converting inline.
- Inputs marked `data-k` are persisted to `localStorage` automatically.
- The solver tools (molarity, dilution, centrifugation) back-fill whichever field you
  leave blank. `releaseSolved` / `markSolved` manage that; the rule is that clearing a
  field targets it, and typing into a solved field hands ownership back to the user.

## Accuracy notes

These are textbook calculations, implemented from published formulae:

- ε280 from sequence: Pace et al. (1995)
- Primer Tm: SantaLucia (1998) unified nearest-neighbour parameters, with the
  salt correction and the von Ahsen Mg²⁺ approximation
- pI: Bjellqvist pKa set, the same one ProtParam uses
- Reagent MWs in the recipe parser are textbook values; each entry lists its synonyms
  in the `REAGENTS` table in `app.js`

The app makes no claim about any particular assay, reagent or protocol. It does
arithmetic. Users are told, in the footer, to check values against their own records.

The image feature recognises text, not chemistry — always confirm the parsed components
against the source before weighing anything out.
