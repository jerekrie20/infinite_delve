---
tags: [mechanic]
status: done
depends-on: [core-run]
---

# Core Run — interaction model, space, verbs

**Related:** [[core-run]] · [[combat]] · [[classes]] · [[delve-generation]]

*Working page. Options → recommendation → DECISION. The interaction model
changed 2026-07-10 from "strict turn-based" to AUTO-BATTLE (see Decision 1).*

## Decision 1 — Interaction model  ⭐ (highest-leverage; cascades everywhere)

Two sub-parts: how you EXPLORE, and how you FIGHT.

- **Exploration:** free real-time movement on a top-down tile grid — walk
  around, peel back fog, bump into monsters to engage. (Not tile-by-tile
  turns.)
- **Combat:** **AUTO-BATTLE.** On engage, both sides' basic attacks fire
  automatically. The player does NOT aim or dodge (not action) and does NOT
  take discrete turns (not turn-based). Reflex-light by design.

**Where the player's agency lives** (this is the whole game — protect it):
1. **Which fights to pick** (engage vs avoid — attrition makes this matter).
2. **Where to stand** — terrain / high-ground bonuses (Decision 6).
3. **When to fire abilities** — manually triggered, the core active input.
4. **When to retreat / extract** — the stakes valve.
5. **The class + build you brought** (Decision 7 + folders 02/03).

**Why auto-battle wins here:** even more mobile/lurker-friendly than turn-based,
easier to make juicy in Phaser, and still cheat-safe — combat is
DETERMINISTIC, so the TS server re-simulates each fight from the seed + the
player's ability-input log to validate loot/XP.

**Risk to guard against:** auto-battle can "play itself." Countered by making
abilities frequent+impactful, engage/avoid a real choice (attrition), and
terrain positioning active. If a fight ever feels passive, we've under-tuned
one of those.

**DECISION:** Auto-battle — ✅ chosen (2026-07-10).
**DECISION:** NO movement during a fight — ✅ (2026-07-10). Rationale: keeps it a
turn-based auto-battler, not an action game; cuts combat-movement code + kiting
AI (real scope cut) and makes fights fully deterministic = trivially cheat-safe.
CONSEQUENCE: positioning becomes a **pre-fight** decision (pick your tile /
terrain and how many enemies to pull *before* you engage). CLASSES differentiate
by role + stats + ability kit + a ranged **opening window** (ranged/mage get free
hits before the melee trade begins) — NOT by in-combat kiting. Detail → [[combat]].
Retreat is still a verb: it ends the fight and returns you to exploration.

## Decision 2 — The space

Square grid, top-down, free real-time movement. Reuses Tiny Swords 64px +
mapgen. A delve = a bounded generated area traversed toward an objective /
extract. **DECISION:** ✅ grid, top-down, free-move.

## Decision 3 — The verbs

- **Move** — free, real-time, **exploration only**; you're stationary once a
  fight starts (positioning is pre-fight).
- **Basic attack** — AUTOMATIC during combat (cadence/flavor set by class).
- **Ability** — MANUAL, the core active input (cost/cooldown).
- **Interact** — chest / door / stairs / NPC.
- **Retreat / Extract** — leave with your loot (ties to stakes).

**OPEN:** ability trigger — cooldown, a resource (mana/stamina), or both?
_pending → [[combat]]._

## Decision 4 — The pressure (what forces decisions)

**Resource attrition** is the primary pressure (user pick): limited HP, little/
no passive regen, finite ability resource/consumables → you can't fight
everything, so engage/avoid/retreat are real. Positioning (Decision 6) is the
secondary layer.

## Decision 5 — Death & extract stakes

**Extract-or-lose:** bank loot by reaching an extract; death loses the
*unbanked* loot this run; the **hero persists** (level/gear kept). The daily
drama. **OPEN:** does death cost anything persistent (durability?) or purely
unbanked run loot? _pending._

## Decision 6 — Terrain / positioning bonuses  (NEW, user)

High ground / terrain grants a combat bonus (e.g. on a mountain vs an enemy on
open ground). Legible, fits auto-battle (position before/while fighting, no
twitch). **Reuses existing code:** mapgen terrain types + Faction War's
terrain-defense-bonus concept port directly. **DECISION:** ✅ terrain bonuses in.
_Detail (which terrains, how much) → [[combat]] + [[delve-generation]]._

## Decision 7 — Classes  (NEW, user)

Pick a class at start: **Warrior / Ranger / Mage** (defines attack range +
ability kit + stat weights). Ranger/Mage mean ranged + magic are in v1 (larger
scope, but core to the fantasy — accepted).

**Hidden advanced classes:** additional classes unlocked via community
discovery — NO in-game hints; the subreddit must figure out the triggers
themselves. Post-launch discovery content (ship 3 base classes first). Pure
Reddit-native collective-discovery hook (blueprint Belonging/Discovery).
**DECISION:** ✅ 3 base classes at launch + hidden classes later.
_Detail → [[classes]]._
