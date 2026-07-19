---
tags: [architecture]
status: living
---

# Architecture (DELVE)

**Related:** [[core-run]] · [[TOOLS]] · [[Home]]

*Drafted 2026-07-08. How the pieces divide and what survives from
factionwar2000. Mechanics detail comes Thu/Fri; this is the container.*

## The split

```
        Reddit post (iframe)                 Reddit servers
   ┌───────────────────────────┐        ┌───────────────────────────┐
   │  Phaser client (WebGL)    │  HTTP  │  TypeScript server (Devvit)│
   │                           │ <────> │                            │
   │  • render delve/hero/mobs │        │  • generate delve + world  │
   │  • animation + juice      │        │  • hero state (Redis)      │
   │  • input + turn/action    │        │  • validate runs (anti-cheat)│
   │  • local combat feel      │        │  • community aggregate     │
   │  • UI (inventory/shop/etc)│        │  • scheduler (daily tick)  │
   │  • the frontier meta view │        │  • posts/comments/payments │
   └───────────────────────────┘        └─────────────┬─────────────┘
                                                       │
                                                  ┌────┴────┐
                                                  │  Redis  │
                                                  └─────────┘
```

**Rule of thumb:** if it must be trusted, persistent, or run while nobody's
watching → server (TS). If the player sees or touches it live → client
(Phaser).

## Client (Phaser) owns

- Rendering the delve from server-sent map data (Phaser tilemaps + sprites).
- Hero, monsters, loot, projectiles, hit effects, animation, screen juice.
- Input, turn/action handling, local combat resolution & prediction.
- All UI: inventory, character sheet, shop, ability bar, the frontier meta
  screen. *(The tedious part — hand-built Phaser UI is more work than Vue.
  Accepted cost.)*
- Talks to the server over HTTP (`fetch` in `src/client/api.ts` ↔
  `src/server/index.ts`).

## Server (TypeScript, kept from factionwar2000) owns

- **Generation** — the daily delve layout + the season frontier world, made
  server-side so clients can't peek or cheat the map.
- **Hero state** — per-userId in Redis (level, XP, inventory, gear, unlocks).
- **Run validation / anti-cheat** — client reports results (loot, depth,
  kills, path); server checks plausibility, awards XP/loot, updates records.
- **Community aggregate** — per-sub shared frontier progress in Redis; the
  daily scheduler tick aggregates contributions, advances the world, spawns
  events, posts the frontier report.
- **Reddit-native** — posts (frontier report, milestones), comments, payments
  (cosmetics).
- **Scaling** — instanced solo delves + per-sub aggregate; shard big subs into
  parallel frontiers.

## Data flow — one delve

1. Client → server: *start today's delve* (userId, sub, day).
2. Server: generate delve from seed (server-side mapgen), return layout +
   hero state + any daily modifiers.
3. Client: render + play the delve (local turn resolution & feel).
4. Client → server: *run complete* (loot, depth, kills, path).
5. Server: validate → award XP/loot → update hero + community aggregate →
   return updated state.
6. Scheduler (daily): aggregate all runs → advance frontier → post report.

## What survives from factionwar2000 (file-level)

**KEEP (adapt lightly):**
- `src/shared/noise.ts` — procedural noise. As-is.
- `src/server/core/mapgen.ts` — repurpose islands/continuous gen for delve +
  world layouts.
- `src/shared/mapParams.ts`, `mapMetrics.ts`, `mapValidation.ts` — tuning +
  quality gates for generated delves.
- `src/shared/terrain.ts`, `grid.ts` — adapt terrain meanings to RPG.
- `src/server/core/state.ts` — Redis state patterns.
- Scheduler cron + tRPC/Hono server skeleton.
- `tools/mapgen` sandbox — **works untouched** (separate app, engine-agnostic).

**REPLACE (war rules → RPG rules), concepts partly port:**
- `resolve.ts` (battle ticks) → combat + loot resolution.
- `theater.ts` (war service) → delve/world service.
- `npc.ts` (barbarian AI) → monster spawning/behavior.
- `view.ts` (war fog of war) → delve reveal / fog.

**DISCARD:**
- The entire Vue client (`src/client/*.vue`, `topDownRender.ts`, `useTileset.ts`,
  `autotile.ts`, components) → rebuilt in Phaser (code-only TypeScript client).

## Why Phaser client is right here (rationale, so we don't relitigate)

1. New game = client rebuilt anyway → no "throwing away a working client" cost.
2. RPG is animation/sprite/juice-heavy = Phaser's strength.
3. Delve generation is server-side → Vue's code-sharing edge doesn't apply.
4. Co-op PvE → combat can be client-side; the "Devvit can't do authoritative
   realtime" objection softens.

## Scope guardrail

Turn-based / light-action needs **animation + collision-lite + juice**, NOT a
physics engine. Do not drift into building a physics platformer unless that
becomes the explicit goal — it changes everything (and points off Reddit).

## Open architecture questions (for later, not Thu/Fri's mechanics focus)

- Exact HTTP contract between the Phaser client and TS server (endpoints, payloads).
- How much of a run the server re-simulates vs trusts (anti-cheat depth).
- Redis key schema for hero + per-sub frontier + daily runs.
- Devvit upload size with the Phaser bundle + Tiny Swords + gear sprites (limit
  is 100 MB / 30 s — generous, but track it).
