---
tags: [catalog, monsters]
status: planned
depends-on: [monsters, combat]
---

# Monster Roster — depths 1-60 authored (D25)

The full launch cast: 6 themes × ~3 templates + 1 boss = **18 templates +
6 bosses**. Fixes the current gap (bosses end at depth 20). Statuses in
**bold** reference [[status-effects]]; passive pools use [[stats-catalog]]
ids. Numbers are baseStats before depth scaling — **sandbox-tunable v1**.

## Pack composition (D32)

Floors spawn 1-3 enemies in front/back rows from the depth's active
templates, splitting the floor budget ([[FORMULAS]]):

| Kind | Composition | Row |
|------|-------------|-----|
| brute | always solo | front |
| grunt | solo or pair | front |
| swarm | pack of 2-3 | front (small silhouettes) |
| caster | backline + 1 front bodyguard (grunt/brute) | back |
| **support** (D40) | backline; heals/buffs its pack on a cast timer (existing handlers: regen, Rage, Shield) | back |
| boss | solo, or +1 add at the sandbox's discretion | front (adds per kind) |

Ranged/caster/support enemies attack (or heal) from the back row on their
own timers; the hero reaches them via `back`-targeting abilities or by
clearing the front. Supports create the classic kill-order decision —
Goblin Shaman is the first support (Rage-buffs its pack); one support per
theme from Crypt onward is the roster rule.

**Theme affinities (D38, ±25% status potency ⚙):**

| Theme | Resists | Vulnerable to |
|-------|---------|---------------|
| Goblin Camp | — | fire (Burn) |
| Crypt | dark (Curse) | fire (Burn) |
| Warrens | nature (Poison) | ice (Slow) |
| Deep | ice (Slow) | lightning (Shock) |
| Volcanic | fire (Burn — immune) | ice (Slow) |
| Abyss | dark + lightning | physical (Bleed) |

## Structure rules (D6)

- **Boss at every 10th depth** (theme finale) — felling it unlocks the
  checkpoint (D4)
- **Mini-boss at every 5th depth** — guaranteed *elevated elite* of a theme
  template: elite multipliers + one extra passive tier + 1.15× scale tint.
  Not authored separately; a spawn rule
- Elites roll per current rules elsewhere; **normal monsters stay
  passive-free** so reading a fight stays possible
- Past depth 60: procedural variants (theme remix + compounding stats +
  bigger passive budgets) until more themes are authored

## Passive pools (extends `passives.ts`)

| Pool | tier1 | tier2 | tier3 |
|------|-------|-------|-------|
| goblinoid *(exists)* | hpRegen | doubleStrikeChance, counterAttackPct | explodeOnKill |
| undead *(exists)* | hpRegen, thornsPct | blockChance, lifestealPct | reviveChance |
| swarm *(exists)* | hpRegen, dodgeChance | lifestealPct | executeThreshold, explodeOnKill |
| brute *(exists)* | thornsPct | blockChance, counterAttackPct | doubleStrikeChance |
| **deep** (new) | dodgeChance | lifestealPct, slowOnHitPct | executeThreshold, statusResist |
| **volcanic** (new) | thornsPct | burnChance, counterAttackPct | explodeOnKill, doubleStrikeChance |
| **abyss** (new) | statusResist, hpRegen | startingShield, slowOnHitPct | reviveChance, executeThreshold |

## The roster

### Depths 1-10 · Goblin Camp (pool: goblinoid/brute)

| Template | Kind | base hp/atk/def | statMult | Notes |
|----------|------|-----------------|----------|-------|
| Goblin Scout *(exists)* | grunt | 8/4/0 | 1.0 | |
| Goblin Brute *(exists)* | brute | 20/6/2 | 1.3 | pool: brute |
| Goblin Shaman **(new)** | caster | 10/5/1 | 1.1 | elite+ rolls **Weaken** via signature |
| **BOSS @10 — Goblin Chieftain** *(move from @5)* | brute | 40/8/3 | 1.5 | Signature: **War Cry** — opens with **Rage** +30% ATK 6s |

### Depths 11-20 · Crypt (pool: undead)

| Template | Kind | base hp/atk/def | statMult | Notes |
|----------|------|-----------------|----------|-------|
| Skeleton *(exists)* | grunt | 12/5/1 | 1.1 | |
| Skeleton Captain *(exists)* | brute | 25/7/3 | 1.4 | |
| Ghoul **(new)** | swarm | 9/6/0 | 1.2 | lifesteal-leaning rolls |
| **BOSS @20 — Necromancer** *(move from @10)* | caster | 50/10/4 | 1.6 | Signature: **Curse of the Grave** — every 12s, telegraphed cast → **Curse** −50% healing, 8s (D39) |

### Depths 21-30 · Warrens (pool: swarm)

| Template | Kind | base hp/atk/def | statMult | Notes |
|----------|------|-----------------|----------|-------|
| Giant Rat *(exists)* | swarm | 6/3/0 | 1.3 | 2× drop chance (swarm rule) |
| Plague Rat **(new)** | swarm | 7/4/0 | 1.3 | attacks 10% chance **Poison** stack |
| Tunnel Horror **(new)** | brute | 28/8/4 | 1.5 | pool: brute |
| **BOSS @30 — Broodmother** *(move from @20)* | swarm | 60/12/5 | 1.7 | Signature: **Feeding Frenzy** — every 15s, shrieks → **Haste** +40% AS, 4s (D39) |

### Depths 31-40 · Deep (pool: deep)

| Template | Kind | base hp/atk/def | statMult | Notes |
|----------|------|-----------------|----------|-------|
| Wraith *(exists — retmpl)* | caster | 16/7/2 | 1.2 | dodge-leaning |
| Deep Stalker **(new)** | grunt | 18/8/2 | 1.3 | attacks 10% **Slow** −20% 4s |
| Gloom Caller **(new)** | caster | 14/9/3 | 1.3 | elite+ opens with **Weaken** |
| **BOSS @40 — The Hollow King** | brute | 70/13/6 | 1.8 | Signature: **Hollowing** — every 12s, telegraphed → **Mark** +25% dmg taken, 6s (D39); innate statusResist 25 |

### Depths 41-50 · Volcanic (pool: volcanic)

| Template | Kind | base hp/atk/def | statMult | Notes |
|----------|------|-----------------|----------|-------|
| Magma Imp **(new)** | swarm | 10/6/1 | 1.3 | attacks 15% **Burn** |
| Cinder Brute **(new)** | brute | 32/10/5 | 1.5 | explodeOnKill-leaning |
| Flame Adept **(new)** | caster | 18/11/3 | 1.4 | elite+ **Ignite**-style Burn |
| **BOSS @50 — Pyre Tyrant** | brute | 85/15/7 | 1.9 | Signature: **Eruption** — every 14s, telegraphed slam → 150% ATK + **Burn** 50%/s, 4s (D39) |

### Depths 51-60 · Abyss (pool: abyss)

| Template | Kind | base hp/atk/def | statMult | Notes |
|----------|------|-----------------|----------|-------|
| Void Spawn **(new)** | grunt | 20/10/3 | 1.3 | statusResist-leaning |
| Abyss Knight **(new)** | brute | 36/12/6 | 1.6 | opens with **Shield** 20% maxHp |
| Null Witch **(new)** | caster | 20/13/4 | 1.5 | attacks 10% **Slow**; elite+ **Curse** |
| **BOSS @60 — Herald of the Abyss** | caster | 100/17/8 | 2.0 | Signature: **Unmaking** — every 12s, telegraphed → **Stun** 1.5s + **Armor Break** −15 DEF%, 8s (D39); innate statusResist 40 |

## Boss signature moves — engine shape

**NO boss phases (D39)** — no HP-threshold triggers anywhere. Signatures
are COOLDOWN abilities: `signature: { cooldownMs, action }` on the
template; action = apply status / buffed hit, all expressible via the
[[status-effects]] framework + existing handlers. Telegraph: one-beat
wind-up animation before each firing, so ability timing (drop your
**Stun**/**Fortify** into the wind-up) is the counterplay — this IS the
manual-advantage layer of boss rooms (D31).

## Spawn-table sanity rules

- Every depth band must have ≥2 non-boss templates active (variety floor)
- `templatesForDepth` gap check: no depth 1-60 may resolve to the fallback
- Mini-boss floors (5,15,25…) force `rarity: elite` + elevated tier — never
  a random normal
- Sprite plan: each theme needs 1 shared silhouette minimum at launch
  (recolor per template acceptable); bosses get unique sprites first
  (they're checkpoint moments)

## Related

- [[monsters]] — engine rules · [[status-effects]] · [[stats-catalog]]
- [[DECISIONS]] D6, D25
