---
tags: [mechanic]
status: in-progress
depends-on: [core-run, combat]
---

# 01 · Classes & Mastery

The prestige spine of the game (D7-D13 in [[DECISIONS]]). Classes evolve
through chains; completing a chain = a **mastery**. Masteries are the
collection, the account power, and the reason to restart.

## The evolution chains (launch: 3 straight chains, D12)

| Base | Stage 2 (~L25) | Stage 3 (~L45) | Fantasy | Style |
|------|----------------|----------------|---------|-------|
| Squire | Warrior | Knight | frontline bruiser | tanky, sustain, blocks |
| Archer | Ranger | Sniper | precise hunter | fast attacks, crits, marks |
| Apprentice | Mage | Archmage | arcane force | slow heavy hits, stuns, DoTs, mana |

(Names past base are placeholders until kits are authored. Branch nodes —
e.g. a second evolution option at each gate — are seasonal content, not v1.0.)

## Chain leveling (D9) + Temple trials (D36)

- One continuous level bar per branch-run, cap **~70**
- **Promotion gates at ~L25 and ~L45** — you must promote to keep leveling
- **Promotion is EARNED at the Temple (D36)**: reaching a gate unlocks a
  short quest (e.g. "slay 40 monsters of the current theme · extract 3
  times from depth 15+") and then a **trial** — a retryable solo boss room
  tuned to the gate level, fought with your real build. Pass = promote:
  pick the branch (v1.0: single option), receive the new form's kit
- **Mastery = reaching the final capstone** of a chain (the L70 capstone
  has its own, harder trial — the mastery is fought for, not aged into)
- Each stage adds abilities + passive-pool entries; stages are additive
  evolutions, not resets

## Mastery grants (D10) — the "why restart"

1. **Account-wide stat bonus** — +2-3% ATK/HP per mastery (exact value →
   balance sandbox), applies to every class forever
2. **The saved class** — the mastered final form stays playable anytime (D8);
   your main for dailies/frontier while an alt climbs
3. **Ability inheritance** — each mastered class donates one signature
   ability; any class may slot ONE inherited ability into its 5-slot bar
4. **Status** — title, flair, hero skin per mastery (feeds [[reddit-native]])

## Hero model (D8)

- **One active hero at a time**; switching between saved mastered classes and
  the in-progress class is free at base (between runs)
- Gold, stash, checkpoints, automation are **account-wide**
- Gear is shared but **level-gated** (D15) — fresh classes grow into the stash
- Restarting a new class begins that class at level 1 with all account
  bonuses, checkpoints, and automation intact

## Pacing (D11)

- First mastery: **~3-4 weeks** of engaged daily play (≈ one season)
- Later chains accelerate: account bonuses + inherited abilities + twinked
  (level-gated) gear + deep starting checkpoints
- XP curve / gate levels tuned in the balance sandbox against this target

## Built today — Squire only

HP 40 +8/level · ATK 6 +1/level · Mana 50 +5/level.
Abilities: Slam (L1), Fortify (L5). Passive pool defined but not yet applied
to heroes. Class select screen does not exist yet (D13: all 3 bases at
creation).

## Kit authoring order (9 kits at launch)

1. Squire kit complete (5 abilities + passives) — proves slot/unlock design
2. Archer base kit — proves per-class attack speed ([[combat]] D14 required)
3. Apprentice base kit — proves status effects (stun/DoT)
4. Stage-2 kits (Warrior/Ranger/Mage) — proves promotion
5. Stage-3 kits (Knight/Sniper/Archmage) — proves mastery + inheritance

## Hidden chains (D37 — post-launch, all three paths)

- **Relic crafting**: rare fragments (specific bosses/depths) forge into
  the unlocking relic at the Forge (uses D44 essence system)
- **Secret deeds**: behavioral conditions ("defeat a trial boss using only
  your basic attack") — un-dataminable, pure community detective work;
  lore encounters (D42) occasionally hint at them
- **Community unlocks**: a frontier milestone opens a chain for the whole
  sub — one player can't solo it

## Deferred

- Branch nodes (2nd option per gate) — seasonal content cadence
- Respec — unnecessary at v1.0 (promotions are the build choice)

## Related

- **Catalog: [[class-kits]] — all 3 chains, 5 slots × 4 options, 60 abilities with v1 numbers (D24)**
- [[hero-progression]] — XP/levels/gates detail · [[combat]] — framework kits need
- [[DECISIONS]] D7-D13, D24
