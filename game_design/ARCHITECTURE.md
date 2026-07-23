---
tags: [architecture]
status: living
---

# Architecture (DELVE)

Side-view idle looter. Phaser WebGL client + TypeScript server (Devvit/Redis).
Shared content layer (`src/shared/content/`) ensures client and server use the
same formulas, stat definitions, and item generation.

## The split

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│  Phaser client (WebGL)      │ HTTP│  TypeScript server (Devvit)  │
│                             │ ←──→│                             │
│  • LaneScene (auto-battle)  │     │  • Hero state (Redis)        │
│  • HudScene (canvas UI)     │     │  • Run validation             │
│  • Item generation preview  │     │  • Item generation (seeded)   │
│  • Ability dispatch         │     │  • Offline idle compute       │
│  • Debug combat log         │     │  • Daily seed / scheduler     │
└─────────────────────────────┘     └─────────────┬───────────────┘
                                                   │
                                              ┌────┴────┐
                                              │  Redis  │
                                              └─────────┘
```

## Shared content layer — the backbone

`src/shared/content/` holds ALL game data and formulas. Both client and server
import from here — no duplication, no drift. Files:

| File | What it holds |
|------|--------------|
| `tuning.ts` | Every numeric knob (HP curves, damage, drop rates, mana) |
| `stats.ts` | Stat registry — 41 stats, each with kind/hook/handler/caps |
| `handlers.ts` | 29 combat handler functions (lifesteal, dodge, thorns, etc.) |
| `items.ts` | Base items, affix pools, rarity tiers, `rollGear()` |
| `sets.ts` | Set definitions with owned items + bonuses |
| `uniques.ts` | Unique item definitions |
| `classes.ts` | Class base stats + level scaling |
| `monsters.ts` | Monster templates with depth ranges + passive pools |
| `passives.ts` | Passive pools shared by monsters AND players |
| `actives.ts` | Active ability definitions + unlock table |
| `gear.ts` | `deriveStats()`, banking, equip/unequip logic |

## Client (Phaser) — `src/client/`

- **`game/LaneScene.ts`** — the combat lane: auto-battle, ability dispatch,
  monster spawning, Continue/Extract, death/reset
- **`game/HudScene.ts`** — canvas UI: top bar, stat bars, skill slots,
  gear grid, tabs (Skills/Summary/Equip), money, bag badge
- **`ui/gear.ts`** — gear panel overlay (DOM), item popup
- **`ui/hud.ts`** — HudSnapshot type, `formatShort()` utility
- **`ui/daily.ts`** — Daily panel (DOM), frontier display
- **`main.ts`** — bootstrap, scene creation, event wiring, modal panels
- **`api.ts`** — HTTP client → server endpoints, MOCK_HERO fallback

Preview: `npx vite` on port 5178.

## Server (TypeScript) — `src/server/`

- **`core/hero.ts`** — hero CRUD in Redis, `toHero()`, XP, banking, idle
- **`core/rng.ts`** — seeded random for deterministic item generation
- **`routes/api.ts`** — game endpoints (/api/hero, /api/run/result, /api/equip)
- **`routes/daily.ts`** — Daily Delve endpoints
- **`routes/scheduler.ts`** — cron jobs (daily tick, frontier aggregate)

## Content authoring — no GUI tools, Claude is the editor

Adding content means editing TypeScript data files directly. The shared content
layer is designed for this: one row = one new monster, ability, item, or stat.
See `../tools/README.md` for the dev tools (combat sim, gear editor, UI map).

> Engineering law (style, structure, validation workflow, agent contract)
> lives in `../CODING_BIBLE.md`. This doc describes the system; the bible
> governs how code gets written into it.

## Engine requirements from the 2026-07-21 plan ([[DECISIONS]])

The decided design imposes five engine-level requirements — sequence these
before/alongside their features:

1. **Seeded deterministic combat end-to-end.** The shared math already takes
   an `Rng`; the client must stop feeding `Math.random`. Required by the
   Daily Delve (same seed = same fight), offline expedition simulation, and
   server-side run verification. One engine, three payoffs.
2. **Headless server run-simulator.** Offline expeditions (D19) replay the
   full combat loop (hooks, statuses, ability policy) server-side. Same
   shared code as the client — no second engine, no drift.
3. **Per-combatant attack timers + status-effect framework** (D14). Kills
   the single global exchange tick; prerequisite for Archer/Apprentice.
4. **Save schema versioning.** Hero state grows a lot (masteries, saved
   classes, checkpoints, automation, consumables). Add a `v` field and
   explicit migrations before the next shape change; retire key-sniffing.
   Target shapes + Redis key map are normative in [[DATA_SCHEMA]].
5. **Deterministic reward math.** `runReward()`/idle income currently
   live-roll elite chances (non-deterministic payouts, random 4× idle rate).
   Switch to expected-value or seeded rolls.

## What's NOT in this architecture (dropped from old design)

- **Map generation** — no procedural grid maps; lane is depth-based
- **Tilemaps / fog-of-war** — no exploration; fight what spawns
- **Pathfinding / movement** — stationary combat; all positioning is visual
- **Class temples / rituals** — deferred; class switching is data-driven
