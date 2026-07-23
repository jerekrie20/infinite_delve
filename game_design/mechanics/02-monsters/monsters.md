---
tags: [mechanic]
status: in-progress
depends-on: [core-run]
---

# 02 · Monsters & the Depth Map

The enemy cast and the world's shape. Endless dungeon, themed in 10-depth
bands, boss every 10th floor (D6 in [[DECISIONS]]). Monsters are data rows
with passive pools; symmetric dispatch with heroes.

## The depth map (D6 — target)

```
depths  1-10   Goblin Camp     boss @10 (checkpoint)
       11-20   Crypt           boss @20 (checkpoint)
       21-30   Warrens         boss @30 (checkpoint)
       31-40   Deep            boss @40 (checkpoint)
       41-50   Volcanic        boss @50 (checkpoint)
       51-60   Abyss …authored themes continue to ~100
       100+    procedural variants (theme remix + scaled stats + richer passives)
```

- **Boss every 10th depth** — felling it unlocks that checkpoint (D4)
- **Mini-boss every 5th depth** — a checkpoint-choice floor, elevated elite
  (elite passives + extra budget), no start-checkpoint unlock
- **Endless** — no depth cap; deep-push is the leaderboard ladder
- ⚠️ Today bosses stop at depth 20 (nothing past 29) — the roster must be
  extended to match this map

## Built — template system

Data rows in `src/shared/content/monsters.ts`: id, sprite, kind
(grunt/swarm/brute/caster), baseStats, statMult, passivePool, depth range,
bossInterval. Adding a monster = one row; the spawn engine scales stats,
rolls rarity, rolls passives.

## Built — rarity tiers

- **Normal** — no passives
- **Elite** — 1-2 passives, 3.5× HP, 1.5× ATK, blue tint (5% +0.1%/depth, cap 40%)
- **Boss** — 2-3 passives from all tiers, 10× HP, 2.5× ATK, gold tint, 1.3× scale

## Built — passive pools (shared with players)

goblinoid · undead · swarm · brute — tiered pools in `passives.ts`,
dispatched through the same 29 handlers heroes use.

## Planned

- **Roster fill for the depth map** — every authored theme needs 2-3 templates
  + a boss row; themes past 30 are currently one wraith
- **Boss signature moves (D39)** — cooldown-based telegraphed abilities
  (NO HP-phase triggers — cut by decision); the ability-timing counterplay
- **Scaling curve rework** — linear `hpPerDepth` won't create walls at depth
  60+; move to mild compounding past ~30 so pushing deep requires gear/mastery
  growth (tune in sandbox)
- **Sprite variety** — every template still renders as goblin/rat
- **Daily/seasonal modifier hooks** — e.g. "elites everywhere" (D21)

## Related

- **Catalog: [[roster]] — full cast to depth 60: 18 templates + 6 bosses with signature moves (D25)**
- [[combat]] · [[delve-generation]] · [[DECISIONS]] D6, D25
