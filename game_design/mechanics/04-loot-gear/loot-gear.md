---
tags: [mechanic]
status: in-progress
depends-on: [combat]
---

# 04 · Loot & Gear

What drops, what you equip, what you risk. Generation is built and good;
the decided additions are **level requirements** (D15) and the **crafting
sink** (D17). See [[DECISIONS]].

## Built — generation

`rollGear(depth, rng)`: base item (slot + primary + affix pool) → depth-
weighted rarity → primary at full budget + rarity-many affixes at 50% budget.
Sets and uniques roll on separate paths. 10 slots, 5 rarities.

## Built — sets & uniques

Warden's Vigil (Rare, 4pc) · Raider's Edge (Epic, 2pc) · uniques with fixed
stat bands, gold coloring. Target: one set per authored theme + a unique
budget per theme (chase items scale with the depth map).

## Built — banking & derivation

Auto-equip best-first on extract; stash cap 30; manual equip/sell;
`deriveStats()` folds class base + level + gear + set bonuses with per-stat
caps.

**Target — smart protected auto-equip (D33):** stays on by default, but
NEVER displaces set pieces, uniques, or manually-equipped items without a
"found better — swap?" prompt on the extract summary. Toggleable off per
player. Offline expeditions use score-based auto-equip only into
unprotected slots.

## Target — level requirements (D15)

- Every item gets `req` ≈ the level a player naturally has at its drop depth
  (formula → balance sandbox; stored, not derived, so tuning changes don't
  retro-gate old items)
- Fresh classes with an endgame stash climb into their inheritance piece by
  piece — twinking accelerates alts without deleting the early game
- Existing saved items migrate with `req` backfilled from stat budget

## Target — crafting / reroll (D17)

Gold sinks on the gear you already have (bad-luck protection that scales):

| Action | Effect | Cost shape |
|--------|--------|-----------|
| Reroll affixes | re-draw an item's affix values (keep base/rarity) | scales with rarity + item level |
| Upgrade rarity | +1 tier = +1 affix slot | steep, capped at epic→legendary |

No crafting materials at v1.0 — gold only (D16).

## Target — stash upgrades (D17)

Purchasable stash pages beyond 30. Also fixes the silent-deletion problem:
overflow must prompt/notify, never silently delete (a set piece is somebody's
collection).

## Target — consumables (D17)

Bought pre-run, consumed on use, 2 loadout slots. Also configurable in the
offline-expedition policy (D19). Launch list (tune in sandbox):

- **Healing Draught** — restore 50% HP once
- **Revive Scroll** — auto-revive once per run (the greed enabler)
- **Loot Charm** — +drop chance this run
- **Whetstone** — +ATK% this run

## Presentation — loot as light (D41)

Kills drop **glowing orbs** on the ground in rarity color (set-green and
unique-orange burn brightest — the grim-glow reward language,
[[ART_BIBLE]] §1). Orbs auto-collect after a beat with a fly-to-bag arc +
name toast on arrival; the extract summary shows the whole pile. No pickup
taps, ever.

## Risk rules (unchanged, D5)

Equipped gear and banked stash are always safe. The run's haul is the stake.

## Related

- **Catalog: [[gear-catalog]] — slot families (33 bases, 2H rules), sets/uniques roadmap, consumables, crafting costs (D23)**
- [[economy]] — the sinks' price ladder · [[classes]] — twinking rules
- [[DECISIONS]] D15-D17, D23
