---
tags: [tools]
status: living
---

# Tools reference

Every tool in the project — what it's for, how to run it, and whether it carries
into **DELVE** (the new game) or is **legacy** from Faction War. Code + tools
live in `../factionwar2000` unless noted. Related: [[ARCHITECTURE]].

## At a glance

| Tool | Run | Port | Purpose | Status for DELVE |
|---|---|---|---|---|
| Map-gen sandbox | `npm run mapgen` | 5870 | tune + preview map generation | ✅ **reusable** |
| Tileset authoring | `npm run tileset` | 5851 | import/slice/anchor tiles | ⚠️ mostly legacy |
| Tagger | `npm run tagger` | 5850 | group tiles → atlas/manifest | ❌ retired (iso-era) |
| Devvit playtest | `npm run dev` | — | build + upload to test sub | ✅ (server side) |
| Obsidian | (app) | — | browse/search these docs | ✅ this vault |

## Map-gen sandbox — `tools/mapgen`  ✅ reusable

Standalone Vite app (`npm run mapgen`, http://localhost:5870). Imports the
**real** generator/metrics/validator from `src/` — no forked algorithm — so what
you tune is what the game ships. Features: seed controls, rule sliders, preview
modes (terrain/ownership/elevation/regions/etc.), fairness metrics, validation
warnings, batch seed tester, and an art (top-down) preview.

**Relevance to DELVE:** the generator is the backbone of [[delve-generation]] —
the same tool tunes delve + world layouts. This is the tool worth keeping and
extending (see the ROADMAP threshold-editor / pacing-sim ideas).

## Tileset authoring — `tools/tileset`  ⚠️ mostly legacy

`npm run tileset` (port 5851). Import PNGs → `art/tiles`, trim, visual anchor
editor, placeholder maker. The **anchor editor** is iso-era and irrelevant to
top-down; only the **sheet-slicer** (cutting sprite sheets, e.g. Tiny Swords
colors) is still useful. Keep the slicer, retire the rest.

## Tagger — `tools/tagger`  ❌ retired

`npm run tagger` (port 5850). Grouped tiles and built the iso atlas + manifest
with auto-anchors. Superseded by the top-down v2 manifest; its `build-atlas.mjs`
would *clobber* the current manifest (neutralized in `package.json`). Iso-era —
slated for deletion.

## Game build / deploy commands

- `npm run dev` — `devvit playtest` (build + upload to the test subreddit).
- `npm run build` — `vite build`.
- `npm run type-check` / `npm run lint` / `npm run test` — the green-bar checks.
- `npm run deploy` / `npm run launch` — upload / submit for review.

## GameMaker → Devvit (future DELVE client)

The new client will be built in **GameMaker**, exported to Devvit. Workflow:
GameMaker *Run* builds WASM → copies to the Devvit `src/client/public/` →
`npm run dev` auto-uploads. Server stays TypeScript. Full guide is saved in
memory (`gamemaker-devvit-build-guide`). Limit: 100 MB / 30 s per upload.

## Obsidian — this vault

Not a project tool, but *the* doc tool: open `game_design/` as a vault for
search, the graph view (system connections), backlinks, and `[[wikilink]]`
navigation. See [[Home]].
