---
tags: [overview]
status: living
---

# 🔨 BUILD — the v0 vertical slice

The plan for turning the design into a playable thing. Build the **foundation
first**: one simple version of the whole loop, running in a Reddit post, before
any deep content. Hub: [[Home]]. Design lives in [[mechanics-index]].

> **v0 goal:** prove the **core delve loop is fun** AND the **GameMaker→Devvit
> pipeline works end-to-end.** Nothing else.

## v0 scope

**IN:**
- **One default class** — the Squire — with a **basic melee auto-attack** (no
  abilities / mana yet).
- **One biome** (Meadow), **1–2 monster types** (grunt + swarm) — see [[monsters]].
- Explore a generated delve (fog) → engage → **auto-battle** → HP (see
  [[core-run]], [[combat]]).
- **Loot:** gold + a couple of basic gear drops → backpack → **extract-or-die**
  ([[loot-gear]]).
- **Hero persists:** class · level · HP · gold · stash saved server-side.
- Runs **inside a Reddit post** (GameMaker client ↔ TS server).

**DEFERRED (layer on after v0):** class trees & [[advancement]], more classes,
abilities/mana, the [[frontier]] & community layer, the Daily Delve &
leaderboards, coin tiers & monetization ([[economy]]), the [[reddit-native]]
reports, bosses, extra biomes, [[hero-progression]] depth. None are needed to
test the core loop.

## Architecture (recap)

GameMaker **client** (WASM in the Reddit webview) + TypeScript **server**
(Devvit/Redis). Reuse the Faction War **map generator** for delve layouts. See
[[ARCHITECTURE]], [[TOOLS]], and memory `gamemaker-devvit-build-guide`.

- **Reusable code to pull in:** from `../factionwar2000/src` — the pure modules
  `shared/noise.ts`, `shared/grid.ts`, `shared/terrain.ts`, `shared/mapParams.ts`,
  and `server/core/mapgen.ts` (adapt into a `generateDelve`). The mapgen sandbox
  tool still works for tuning.

## Who does what

- **TS server + shared code + GML scripts** → Claude can write directly.
- **GameMaker project** (objects, rooms, sprites, running the IDE) → you. Claude
  can hand you GML to paste and plan the structure, but can't drive the IDE.

## Build order

### Step 1 — Pipeline  ⬅️ (you're doing this)
Get the **GameMaker → Devvit template** running: a blank game showing in a
test-subreddit post. Follow `HowToBuild.md` / the Reddit "GameMaker" template.
**Done when:** you hit Run in GameMaker and see it in a Reddit post.

### Step 2 — Server (TS)
Adapt the template's `src/server`:
- **`generateDelve(seed)`** — reuse mapgen/noise to make a bounded Meadow area:
  walkable tiles + fog, scatter a few **monster spawns** + **loot spots** + one
  **extract point**. (This is the main new server logic → grows into
  [[delve-generation]].)
- **Hero state in Redis** — key `hero:{userId}` → `{ class, level, xp, hp,
  maxHp, gold, stash[], equipped{} }`.
- **Endpoints (HTTP ↔ `reddit_*_server_api.gml`):**
  - `POST /api/hero` → get-or-create the player's hero; returns hero state.
  - `POST /api/delve/start` → returns a generated delve (tiles, monsters, loot,
    extract) + the run seed; stash the active seed at `run:{userId}`.
  - `POST /api/delve/result` → client submits `{ killed, lootGrabbed, depth,
    extracted|died }`; server awards XP/gold/loot to the hero (or drops unbanked
    on death), returns updated hero.
- **Anti-cheat:** v0 **trusts the client** (co-op PvE, no leaderboard yet).
  Add server re-sim later, before the Daily/leaderboard ship.

### Step 3 — Client (GameMaker)
The core loop, talking to the server. Suggested structure:
- **Rooms:** `rmHub` (see hero, Delve button) · `rmDelve` (the run).
- **Objects:** `oGame` (controller + HTTP), `oHero` (move, HP, auto-attack),
  `oMonster` (grunt/swarm: HP, auto-attack, 1 signature later), `oLoot`
  (pickup), `oExtract`, `oUI` (HP · gold · backpack).
- **Scripts:** the template's server API + `scr_delve_build` (server JSON →
  build the room), `scr_autobattle` (stationary engage: both sides lose HP on a
  timer until one dies or hero retreats), `scr_hero_stats`.
- **Loop:** hub → start delve → explore fog → touch monster → auto-battle → grab
  loot → reach extract (bank) or die (lose unbanked) → submit result → hub.

### Step 4 — Playtest
Run it in the post. **Is the loop fun?** Tune numbers (HP, damage, loot rate),
then start layering deferred systems.

## Definition of done (v0)

In a Reddit test post you can: see your Squire, enter a Meadow delve, explore,
auto-fight a couple of monsters, grab loot, **extract or die**, and your hero's
**gold / level / HP persists** into the next run.

## After v0 (rough order)

Abilities + mana → more monsters + a boss → 2nd/3rd biome → the [[frontier]]
aggregate + a season → the **Daily Delve** + leaderboard (add anti-cheat here) →
class trees & [[advancement]] → [[reddit-native]] reports → [[economy]] &
cosmetics. Each is a layer on the working v0 base.

## Blocking questions for v0 only

Almost none — most open items ([[FINALIZE]]) are deferred systems. The only v0
values to pick (all cheap to tune later): starting hero HP/damage, monster
HP/damage, loot drop rate, delve size. We'll set placeholders and tune in Step 4.
