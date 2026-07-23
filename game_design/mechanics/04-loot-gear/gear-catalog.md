---
tags: [catalog, loot]
status: planned
depends-on: [loot-gear, combat]
---

# Gear Catalog — slot families, sets, uniques, consumables, crafting

The full itemization spec (D23, D15, D17 in [[DECISIONS]]). Stats reference
[[stats-catalog]]. All numbers **sandbox-tunable v1**.

## Slot family matrix (D23) — 33 bases

Every slot is a family of ~3 bases. Each base = `primary` stat (always rolls,
full budget) + affix `pool` (rarity draws extras). Class affinity is
flavor-by-pool, never a lock.

### Weapons

**hand1 — one-handed** (pairs with any off-hand):

| Base | Primary | Affix pool | Affinity |
|------|---------|-----------|----------|
| Sword | attack | attackPct, lifestealPct, maxHp, increasedCritPct, doubleStrikeChance | Squire |
| Axe | attack | attackPct, armorPierce, bleedChance, critMultiplier, poisonChance, poisonDamage | Squire/Archer |
| Dagger | attack | attackSpeedPct, increasedCritPct, baseCritChance, lifestealPct, executeThreshold | Archer |

**2H — two-handed** (occupies hand1+hand2; budget ×1.6; blocks off-hand):

| Base | Primary | Affix pool | Affinity |
|------|---------|-----------|----------|
| Greatsword | attack | attackPct, cleavePct, slowOnHitPct, critMultiplier, preemptiveStrike | Squire |
| Bow | attack | attackSpeedPct, increasedCritPct, bleedChance, baseCritChance, armorPierce | Archer |
| Staff | attack | abilityPowerPct, maxManaPct, burnChance, manaRegenPct, increasedCritPct | Apprentice |

**hand2 — off-hands**:

| Base | Primary | Affix pool | Affinity |
|------|---------|-----------|----------|
| Shield | defensePct | maxHp, maxHpPct, blockChance, blockAmount, blockHeal, thornsPct | Squire |
| Quiver | attack | attackSpeedPct, increasedCritPct, bleedChance, dodgeChance, itemDropChance | Archer (with dagger — the 1H alternative to bow) |
| Orb | maxMana | abilityPowerPct, manaRegenPct, startingShield, shieldLeechPct, manaLeechPct | Apprentice |

### Armor

| Slot | Base | Primary | Affix pool |
|------|------|---------|-----------|
| body | Plate | maxHp | maxHpPct, defensePct, thornsPct, damageReductionPct, hpRegen |
| body | Leather | maxHp | dodgeChance, attackSpeedPct, maxHpPct, hpRegen, counterAttackPct |
| body | Robe | maxMana | maxHp, abilityPowerPct, manaRegenPct, maxManaPct, statusResist |
| head | Helm | maxHp | maxHpPct, defensePct, attack, hpRegen, blockChance |
| head | Hood | maxHp | increasedCritPct, dodgeChance, attackSpeedPct, goldFindPct |
| head | Circlet | maxMana | abilityPowerPct, cooldownReductionPct, maxManaPct, increasedCritPct |
| legs | Greaves | maxHp | maxHpPct, defensePct, damageReductionPct, hpRegen, hpRegenPct |
| legs | Leggings | maxHp | dodgeChance, attackSpeedPct, goldFindPct, xpBonusPct |
| legs | Wraps | maxHp | manaRegenPct, abilityPowerPct, hpRegenPct, statusResist |
| feet | Sabatons | defensePct | maxHp, blockChance, damageReductionPct, thornsPct |
| feet | Boots | defensePct | dodgeChance, goldFindPct, attackSpeedPct, maxHp |
| feet | Slippers | maxMana | manaRegenPct, cooldownReductionPct, dodgeChance, xpBonusPct |
| belt | Girdle | maxHp | maxHpPct, thornsPct, hpRegen, healOnKillPct, damageReductionPct |
| belt | Quickbelt | maxHp | attackSpeedPct, goldFindPct, itemDropChance, dodgeChance |
| belt | Sash | maxMana | manaCostReductionPct, abilityPowerPct, hpRegenPct, goldFindPct |

### Jewelry (Ring family fits ring1 OR ring2)

| Slot | Base | Primary | Affix pool |
|------|------|---------|-----------|
| ring | Signet | attack | attackPct, increasedCritPct, baseCritChance, critMultiplier, lifestealPct |
| ring | Loop | maxHp | maxHpPct, hpRegen, dodgeChance, goldFindPct, xpBonusPct |
| ring | Arcane Band | maxMana | abilityPowerPct, cooldownReductionPct, manaLeechPct, increasedCritPct |
| amulet | Pendant | attack | attackPct, increasedCritPct, lifestealPct, healOnKillPct, executeThreshold |
| amulet | Talisman | maxHp | maxHpPct, defensePct, statusResist, startingShield, reviveChance |
| amulet | Focus | maxMana | abilityPowerPct, maxManaPct, manaCostReductionPct, burnChance, shieldLeechPct |

**Engine changes this matrix needs:** `twoHanded: true` flag on BaseItem
(equipping 2H unequips hand2 to stash; equipping an off-hand unequips a 2H);
Ring family usable in both ring slots; drop roller picks base uniformly per
slot family (keeps per-slot drop rate unchanged).

## Level requirements (D15)

`req = clamp(round(dropDepth × 0.75), 1, 70)` — stamped on the item at roll
time (stored, not derived, so later tuning never retro-gates old items).
A depth-40 drop needs level 30. Migration: backfill existing saved items with
`req = 1` (grandfathered — cheap and player-friendly).

## Sets roadmap — one per theme (6 at launch)

| Set | Theme (depths) | Rarity | Pieces | Bonuses (v1) |
|-----|---------------|--------|--------|--------------|
| **Scrapper's Rig** | Goblin Camp 1-10 | uncommon | 3 (helm, belt, boots) | 2pc +10% goldFind · 3pc +8% attackSpeedPct |
| **Warden's Vigil** *(exists — retheme Crypt)* | Crypt 11-20 | rare | 4 (body, head, feet, amulet) | 2pc +4 DEF% · 4pc +40 maxHp |
| **Broodwatcher** | Warrens 21-30 | rare | 3 (dagger, quiver, leather) | 2pc +8% AS · 3pc +10% poisonChance |
| **Raider's Edge** *(exists — expand)* | Deep 31-40 | epic | 3 (blade, ring, hood) | 2pc +8 ATK · 3pc +15% increasedCrit |
| **Cindersworn** | Volcanic 41-50 | epic | 4 (staff, circlet, robe, sash) | 2pc +12% abilityPower · 4pc +15% burnChance |
| **Voidbound** | Abyss 51-60 | legendary | 5 (body, head, amulet, ring, belt) | 2pc +10% maxMana · 4pc +10% CDR · 5pc +20% startingShield |

Set items drop only within (or near) their theme's depth band — sets become
the *reason to farm a band* even after you can push past it.

## Uniques roadmap — 2 per theme (12 at launch)

Existing: **Gutripper** (1H sword, Deep) · **Aegis Heart** (amulet, Crypt).
To author (name / slot / signature idea):

| Theme | Unique 1 | Unique 2 |
|-------|----------|----------|
| Goblin Camp | *Shiv of the Unpaid* (dagger — goldFind + execute) | *Squealer's Hide* (leather — dodge + counterAttack) |
| Crypt | **Aegis Heart** ✅ | *Gravecaller* (staff — Curse on hit + AP) |
| Warrens | *Broodmother's Fang* (dagger — poison duo) | *Tunnel Rat's Charm* (loop — itemDrop + xpBonus) |
| Deep | **Gutripper** ✅ | *The Hollow Crown* (circlet — CDR + statusResist) |
| Volcanic | *Everburn* (staff — burnChance + Burn magnitude) | *Magma Ward* (shield — blockHeal + thorns) |
| Abyss | *Voidfang* (bow — bleed + Mark on crit?) | *Null Sigil* (talisman — reviveChance + startingShield) |

Uniques with on-hit status signatures wait for the status framework; the
stat-only ones can ship anytime.

## Consumables (D17) — bought pre-run, 2 loadout slots

| Item | Effect | Price (v1) | Offline-policy legal |
|------|--------|-----------|---------------------|
| Healing Draught | heal 50% maxHp (use: auto at <30% HP) | 30g | ✅ |
| Revive Scroll | auto-revive once at full-death, 50% HP | 150g | ✅ (the greed enabler) |
| Loot Charm | +25% itemDropChance this run | 60g | ✅ |
| Whetstone | +15% ATK this run | 40g | ✅ |

Prices scale ×(1 + startingCheckpointDepth/20) so deep farm runs pay more per
potion. All four map to existing/new stats or the **Regen**-style rules — no
bespoke engine paths. **Unused consumables are consumed at run end either
way (D34)** — per-run provisions, no inventory system; expeditions buy per
run from the policy automatically.

## Crafting — salvage + the Forge (D44, revises D17)

**Selling is replaced by SALVAGE**: an item breaks into gold (the old
sellValue) + **essences** of its rarity tier. One material family, five
tiers (Common→Legendary Essence), no marketplace, no trading. Junk drops
now feed builds.

| Action | Cost (v1) |
|--------|-----------|
| Salvage an item | free → yields `sellValue` gold + `1 + affixCount` essences of its rarity ⚙ |
| Reroll affix values | 50g × rarityMult + 3 essences (same tier as item) |
| Reroll one affix | 120g × rarityMult + 6 essences (same tier) |
| Upgrade rarity | 400g × newTierMult + 10 essences of the TARGET tier; epic→legendary 4,000g + 10 legendary essences; legendary is the ceiling |
| Forge a relic (D37 hidden chains) | recipe-specific fragments + legendary essences |
| **Forge a chosen unique (D46 pity)** | ~35 ⚙ unique-fragments of that THEME (1 drops per boss kill there) + gold; the visible chase bar |
| **Loot-filter rules (D47, free)** | "auto-salvage ≤ rarity X below depth Y"; sets/uniques always exempt; applies to live runs AND expeditions |

rarityMult: common 1 · uncommon 2 · rare 4 · epic 8 · legendary 16.
Uniques and set items cannot change rarity; value-reroll only.
Essences are account-wide, stored as 5 counters ([[DATA_SCHEMA]] — trivial
size). Down-tier conversion 4:1 ⚙; never up-tier (legendary essences only
come from legendary salvage — the endgame loop).

## Stash

Base 30 slots; +10 per purchased page at 500g × pageNumber. Overflow NEVER
silently deletes — banking beyond capacity prompts a keep/sell pick
(auto-resolve rule for offline runs: sell lowest gearScore).

## Related

- [[loot-gear]] — system rules · [[stats-catalog]] — every pool stat
- [[class-kits]] — who chases what · [[DECISIONS]] D15, D17, D23
