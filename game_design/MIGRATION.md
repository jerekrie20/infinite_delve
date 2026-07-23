---
tags: [meta]
status: living
---

# Migration — old design → current game

The old design (`game_design_old/`) was written for a **top-down grid exploration
game** built in GameMaker, then adapted for Phaser. The current game pivoted to
a **side-view idle looter lane** — no movement, no exploration, no map
generation. This doc tracks what changed and why.

## The pivot (2026-07-18)

Decision: **focus on game fun, not tools or Reddit meta.** The top-down grid
game required map generation, tilemaps, fog-of-war, pathfinding, and movement
code — all before a single fight was fun. The side-view lane distills the game
to its core: **auto-battle + ability timing + push-or-extract stakes.**

See memory: [[delve-phaser-pivot]] and [[delve-game-first-pivot]].

## What was dropped

| Old concept | Why dropped |
|-------------|-------------|
| Grid exploration / free movement | Added scope without adding fun to core loop |
| Fog of war / map reveal | Requires map generation; not applicable to lane format |
| Procedural map generation (delve gen) | Server mapgen was the old game's backbone; lane doesn't need it |
| Terrain / positioning bonuses | No positioning in side-view 1v1 |
| Ranged opening windows | No ranged combat in lane format |
| Pre-fight engage decisions | Engagement is automatic — fight what spawns |
| Class temples / advancement rituals | Too much scope for current state; may return later |
| Crafting / quest items | Deferred until gear system matures |

## What was adapted

| Old concept | How it survived |
|-------------|----------------|
| Auto-battle | Became the ENTIRE game — side-view lane, no movement |
| Extract-or-lose stakes | Became per-kill Continue/Extract choice |
| Gear slots + rarities | Built: 10 slots, 5 tiers, affix pools, sets, uniques |
| Monster archetypes | Built: 8 templates, 4 themes, passive pools, rarity tiers |
| Active abilities + mana | Built: 2 abilities, mana regen, cooldowns |
| Passive stat system | Built: 41 stats, 29 handlers, 7 hook points — exceeds old spec |
| Class system | Squire only today; the Warrior/Ranger/Mage vision still planned |
| Hero persistence (server) | Built: Redis-backed, deriveStats, gear banking |
| Daily/season/frontier | Designed but parked — see [[frontier]] |

## What's new (not in old design)

- **Passive pools** for monsters AND players — shared stat infrastructure
- **Behavioral stat hooks** — onAttack, onCrit, onDealDamage, onTakeDamage, onKill, perTick, onCombatStart
- **Symmetric dispatch** — monsters use the same handlers as heroes
- **Monster rarity** — normal/elite/boss with tiered passive pools
- **Combat summary tab** — last 5 exchanges visible in HUD
- **Debug mode** — `?debug=1` streams every combat event to console
- **Combat simulator** — `tools/combat-sim.html` for balance testing

## What to keep from the old design

The old docs in `game_design_old/` are preserved as reference. These sections
are still the intended direction:

- [[CORE_LOOP]] — session/daily/season/lifetime loop (adapted, not replaced)
- [[frontier]] — community meta layer (designed, parked)
- [[economy]] — monetization principles
- [[reddit-native]] — how the game lives in Reddit
- [[hero-progression]] — XP, levels, prestige
- The class fantasy (Warrior/Ranger/Mage) — adapt to idle format
- `FINALIZE.md` — most decisions still hold
