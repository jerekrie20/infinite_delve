---
tags: [mechanic]
status: in-progress
depends-on: [core-run, classes]
---

# 02 · Monsters

The enemy **cast** — the archetypes you fight and what makes each a threat.
Defined before [[combat]] (know *who* fights before *how* fighting works). In an
auto-battle (no dodging), danger comes from stats + abilities + **numbers** +
terrain + rock-paper-scissors vs your [[classes|class]] — never reflex. Hub:
[[Home]].

## Decided ✅
- **Biome-themed** rosters. v1 biomes: **Meadow → Forest → Swamp** (escalating).
- **Model:** the archetypes below are fixed **roles**; each biome fills them with
  its own creatures + **one signature monster** (e.g. a Swamp Bog Witch).

## Archetype roles (the fixed set)

| Archetype | Threat | Notes |
|---|---|---|
| Grunt | fair melee filler | baseline |
| Swarm | weak but many | punishes single-target; feeds Mage AoE |
| Skirmisher | ranged, hits before you close | pull carefully |
| Brute / Tank | soaks, slow | attrition or burst |
| Elite / miniboss | rare, big drops | a real fight |
| **Trial boss** | class-temple gate + delve capstone | gates [[advancement]] |

Design lever: threat comes from **composition** (swarm + skirmisher behind it)
and each monster having **one signature move** (knockback, heal allies), so
fights are "who do I burst first," not reflex.

## Open questions
1. ✅ **Biome-themed** — each biome fields its own roster (reuses the
   [[delve-generation|generator]]'s terrain).
2. ✅ **Scale by delve depth + biome tier**, NOT hero level (deeper = harder =
   better loot; the player sets their own difficulty — feeds push-or-bank).
3. ✅ **Stats + one signature move**, no mana (the gimmick: knockback / heal /
   poison). The player juggles mana; monsters bring a single trick.
4. Boss design — phases? telegraphs that matter without dodging?

## Related
[[core-run]] · [[classes]] · [[combat]] · [[advancement]] · [[delve-generation]]
