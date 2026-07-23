---
tags: [catalog, classes]
status: planned
depends-on: [classes, combat]
---

# Class Kits Catalog — 3 chains, 5 slots × 4 options, 60 abilities

The full launch ability grid (D24 in [[DECISIONS]]). All numbers are
**sandbox-tunable v1**. Statuses in **bold** reference [[status-effects]];
stats reference [[stats-catalog]]. Requires the D14 framework (per-class
attack intervals + statuses).

## Chain overviews

| | Squire → Warrior → Knight | Archer → Ranger → Sniper | Apprentice → Mage → Archmage |
|---|---|---|---|
| Fantasy | frontline bruiser | precise hunter | arcane force |
| Attack interval | **2.0s** | **1.5s** | **3.0s** |
| HP | 40 +8/lvl | 30 +6/lvl | 26 +5/lvl |
| ATK | 6 +1.0/lvl | 5 +0.8/lvl | 8 +1.4/lvl |
| Mana | 50 +5/lvl | 40 +4/lvl | 80 +8/lvl |
| Scales with | HP/DEF/sustain, block/thorns | attack speed, crit, **Bleed**/**Mark** | abilityPowerPct, mana, **Burn**/**Stun** |
| Chase weapon | sword/axe + shield | bow (2H) or dagger+quiver | staff (2H) or 1H + orb |
| Inheritance signature (D10) | **Second Wind** | **Hunter's Mark** | **Mana Shield** |

Promotion at L25/L45 (D9): +10% to base HP/ATK/Mana per stage, next passive
tier unlocks, new ability slot + option wave (below), sprite evolves.

**Passive pools** (extend `passives.ts`; tiers gate by PLAYER_LEVEL_RULES):

- `squire`: t1 [hpRegen] · t2 [thornsPct, dodgeChance] · t3 [counterAttackPct, blockChance] *(exists)*
- `archer` (new): t1 [dodgeChance] · t2 [attackSpeedPct, increasedCritPct] · t3 [bleedChance, doubleStrikeChance]
- `apprentice` (new): t1 [manaRegenPct] · t2 [abilityPowerPct, maxManaPct] · t3 [burnChance, cooldownReductionPct]

## Slot roles + unlock schedule (updated for rotation combat, D30)

Same 5 roles across all chains:

| Slot | Role | Slot unlocks (option 1) | Option 2 | Option 3 | Option 4 |
|------|------|------------------------|----------|----------|----------|
| 1 | **Attack style — your basic attack** (no mana, fires on the attack-speed timer) | L1 | L25 | L45 | L70 |
| 2 | Guard — survival | L5 | L25 | L45 | L70 |
| 3 | Tactic — status/utility | L12 | L25 | L45 | L70 |
| 4 | Power — big cooldown | L25 (promo) | L35 | L55 | L70 |
| 5 | Ultimate | L45 (promo) | L55 | L62 | L70 |

Loadout = 1 option per slot, swappable at base between runs. Slots 2-5 fire
via the **player-ordered rotation** (D30: priority list, drag to reorder,
skip-if-unaffordable; manual taps interleave anytime). The `Auto` column on
slots 2-5 is each ability's DEFAULT rotation hint — automation tier 2
(rotation conditionals) lets players author rules like `HP<50`:
`CD` cast whenever ready · `HP<x` only below x% HP · `BOSS` hold for
elite/boss floors · `KEEP` maintain buff uptime · `OPEN` at fight start.
Targeting types per D32: `front` (default) / `all` / `back` / `random`.

## ⚔️ Squire chain

### Slot 1 — Attack style (basic attack: no mana, every swing; D30 rebalance)
| # | Style | Effect (v1) | Target |
|---|-------|-------------|--------|
| 1 | Slam | 115% ATK, heavy single hit | front |
| 2 | Crushing Blow | 100% ATK; 15% chance **Armor Break** (−10 DEF%, 3s) | front |
| 3 | Reckless Swing | 135% ATK; you take +10% damage while equipped | front |
| 4 | Executioner's Chop | 105% ATK; +50% more vs targets <30% HP | front |

### Slot 2 — Guard
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Fortify | 25 | 20s | **Fortify** −50% dmg taken, 3s *(exists)* | HP<60 |
| 2 | Shield Wall | 25 | 18s | **Shield** = 25% maxHp | HP<70 |
| 3 | Second Wind ★ | 30 | 25s | heal 30% maxHp | HP<40 |
| 4 | Retribution | 30 | 22s | **Fortify** −30% + thorns 100% of dmg taken, 4s | HP<60 |

★ = chain inheritance signature.

### Slot 3 — Tactic
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Taunting Shout | 15 | 12s | **Weaken** −20% ATK, 5s | OPEN |
| 2 | Sunder | 18 | 14s | **Armor Break** −16 DEF%, 8s | BOSS |
| 3 | War Banner | 22 | 18s | **Rage** +25% ATK, 5s | KEEP |
| 4 | Stunning Bash | 25 | 16s | 100% ATK + **Stun** 1.5s | BOSS |

### Slot 4 — Power (Warrior, L25)
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Whirlwind | 30 | 15s | 3 hits × 90% ATK | CD |
| 2 | Berserk | 35 | 25s | **Rage** +40% + **Haste** +30%, 6s; take +15% dmg | BOSS |
| 3 | Skullcrack | 35 | 20s | 220% ATK + **Stun** 2s | BOSS |
| 4 | Rampage | 30 | 18s | 200% ATK; a kill refunds the cooldown + overkill carries (cleave rule) | CD |

### Slot 5 — Ultimate (Knight, L45)
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Aegis Oath | 45 | 40s | **Shield** 40% maxHp + **Fortify** −40%, 5s | HP<50 |
| 2 | Judgement | 50 | 35s | 400% ATK; +50% more per debuff on the target | BOSS |
| 3 | Last Stand | 50 | 60s | 5s: HP cannot drop below 1; then heal 25% maxHp | HP<25 |
| 4 | Crusade | 55 | 45s | 8s: +30% ATK, −30% dmg taken, attacks cleave | BOSS |

## 🏹 Archer chain

### Slot 1 — Attack style (basic attack: no mana, every shot; D30 rebalance)
| # | Style | Effect (v1) | Target |
|---|-------|-------------|--------|
| 1 | Piercing Shot | 105% ATK, ignores 30% of DEF | front |
| 2 | Twin Shot | 2 hits × 55% ATK | front ×2 |
| 3 | Serrated Arrow | 95% ATK; 20% chance +1 **Bleed** stack | front |
| 4 | Snipe | 110% ATK; +10 flat crit chance; can hit **back** row | back-priority |

### Slot 2 — Guard
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Tumble | 15 | 15s | +40% dodge, 3s | HP<60 |
| 2 | Smoke Screen | 18 | 16s | **Slow** −30% AS on monster, 4s | HP<70 |
| 3 | Adrenaline | 25 | 22s | heal 15% maxHp + **Haste** +20%, 4s | HP<50 |
| 4 | Spike Trap | 25 | 20s | **Stun** 1.5s + 1 **Bleed** stack | BOSS |

### Slot 3 — Tactic
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Hunter's Mark ★ | 15 | 14s | **Mark** +25% dmg taken, 6s | OPEN |
| 2 | Crippling Shot | 15 | 12s | 90% ATK + **Slow** −25% AS, 5s | CD |
| 3 | Focus | 20 | 18s | +50 increasedCrit%, 4s | KEEP |
| 4 | Poison Tips | 22 | 20s | 6s: every attack applies 1 **Poison** stack | BOSS |

### Slot 4 — Power (Ranger, L25)
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Volley | 28 | 15s | 4 hits × 70% ATK | CD |
| 2 | Barbed Assault | 28 | 14s | 130% ATK + 2 **Bleed** stacks | CD |
| 3 | Wind Chaser | 30 | 24s | **Haste** +40% AS, 5s | KEEP |
| 4 | Killer Instinct | 32 | 20s | 180% ATK; executes targets <15% HP | BOSS |

### Slot 5 — Ultimate (Sniper, L45)
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Deadeye | 45 | 35s | 500% ATK, guaranteed crit | BOSS |
| 2 | Arrow Storm | 50 | 40s | 8 hits × 60% ATK | CD |
| 3 | Perfect Draw | 45 | 40s | 6s: +0.5 critMultiplier, +30% AS | BOSS |
| 4 | Marked for Death | 48 | 35s | **Mark** +50%, 8s + 200% ATK | BOSS |

## 🔮 Apprentice chain

Ability damage below scales with `abilityPowerPct` (×(1+AP/100)).

### Slot 1 — Attack style (basic attack: no mana, every cast; D30 rebalance)
| # | Style | Effect (v1) | Target |
|---|-------|-------------|--------|
| 1 | Fire Bolt | 115% ATK; 15% chance **Burn** (40%/s, 3s) | front |
| 2 | Frost Shard | 105% ATK; 15% chance **Slow** (−20% AS, 3s) | front |
| 3 | Spark | 90% ATK; grants +15% attack speed while equipped | front |
| 4 | Void Lance | 110% ATK, ignores 50% of DEF | front |

### Slot 2 — Guard
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Mana Shield ★ | 25 | 20s | **Shield** = 30% maxHp | HP<70 |
| 2 | Blink | 20 | 18s | +100% dodge, 2.5s | HP<50 |
| 3 | Frost Armor | 28 | 22s | **Fortify** −30% + attacker **Slow** −20%, 5s | HP<60 |
| 4 | Life Tap | 0 | 15s | convert 10% maxHp → 40% maxMana | KEEP |

### Slot 3 — Tactic
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Ice Nova | 30 | 18s | 100% ATK + **Stun** 2s | BOSS |
| 2 | Ignite | 24 | 14s | **Burn** (60%/s, 4s) | CD |
| 3 | Curse of Decay | 22 | 16s | **Curse** −50% healing + **Weaken** −15%, 8s | OPEN |
| 4 | Arcane Intellect | 26 | 20s | +30 abilityPowerPct, 6s | KEEP |

### Slot 4 — Power (Mage, L25)
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Fireball | 40 | 18s | 350% ATK + **Burn** (40%/s, 3s) | CD |
| 2 | Chain Frost | 38 | 20s | 150% ATK + **Stun** 1s + **Slow** −30%, 5s | BOSS |
| 3 | Mana Surge | 0 | 30s | restore 50% maxMana; next cast costs 0 | KEEP |
| 4 | Meteor | 45 | 25s | 450% ATK landing after 2s + **Burn** | BOSS |

### Slot 5 — Ultimate (Archmage, L45)
| # | Ability | Mana | CD | Effect | Auto |
|---|---------|------|----|--------|------|
| 1 | Pyroclasm | 70 | 45s | 700% ATK + **Burn** (60%/s, 5s) | BOSS |
| 2 | Absolute Zero | 65 | 45s | 300% ATK + **Stun** 3s + **Slow** −40%, 6s | BOSS |
| 3 | Arcane Overload | 60 | 50s | 6s: +50 abilityPowerPct, −50% mana costs | KEEP |
| 4 | Soul Harvest | 60 | 40s | 250% ATK; heal 100% of damage dealt | HP<40 |

## Authoring/implementation priority

1. **Option-1 column** (15 abilities) = the minimum playable game — every
   class functions with slot defaults. Ship first
2. Option 2 column (unlocks L25-35) with the first promotion build
3. Options 3-4 with stage-3/capstone work
4. Every ability = one row in `actives.ts` + (for new effect types) one
   handler; the [[status-effects]] framework covers all 60. Buff abilities
   that modify a stat (Tumble +dodge, Focus +crit, Arcane Intellect +AP,
   Perfect Draw, Poison Tips) use the generic **StatMod** status; Last Stand
   uses **Undying**
5. Small ability-handler mechanics (local to ability dispatch, NOT framework
   features): Meteor's 2s delayed hit · Life Tap / Mana Surge resource ops ·
   Rampage's kill-refund · Deadeye's forced crit · Judgement's
   count-active-debuffs read · Soul Harvest's self-heal-from-damage

## Balance guardrails (for the sandbox)

- Slot-1 attack styles: ~equal sustained DPS (±10%) — they differ in
  *shape* (rider effects, targeting, self-modifiers), not raw output
- Ultimates: ≥2.5× the impact of a Power per cast, ≥2× the cooldown
- Stun uptime from any single loadout must stay <35% vs bosses (boss stun
  rule in [[status-effects]] enforces the rest)
- Rotation with zero manual input clears at-level normal floors; **manual
  boss play beats rotation-only by 20-30%** (D31) — measure both in the sim
- Apprentice basic-attack DPS is lowest (3s beat); ability DPS highest —
  if a Mage loadout out-sustains a Squire with an empty mana bar, numbers
  are wrong

## Related

- [[classes]] — chain/mastery structure · [[status-effects]] · [[stats-catalog]]
- [[DECISIONS]] D9-D14, D24
