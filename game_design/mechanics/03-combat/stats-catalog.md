---
tags: [catalog, combat]
status: planned
depends-on: [combat]
---

# Stats Catalog — the full registry, audited + extended

Source of truth for every stat the game will have. Extends
`src/shared/content/stats.ts` (41 stats today). Verdicts below tell
implementation exactly what to keep, fix, retire, and add. All numbers are
**sandbox-tunable v1**. See [[status-effects]] for the statuses that several
stats apply, and [[gear-catalog]] for which bases roll what.

## Legend

- **live** — implemented today, keep as-is unless noted
- **fix** — exists but needs rework (wrong `target`, wrong semantics)
- **stage→live** — `implemented: false` today; goes live with the status
  framework / listed system
- **retire** — remove from the registry
- **NEW** — add to the registry

## Part A — existing 41 stats, audited

### Core structural (all live, no changes)

| Stat | Op → target | Cap | Notes |
|------|------------|-----|-------|
| attack | flat → attack | — | |
| attackPct | pct → attack | 60% roll | |
| maxHp | flat → maxHp | — | |
| maxHpPct | pct → maxHp | 60% roll | |
| defensePct | flat → defensePct | 75 | |
| baseCritChance | flat → baseCritChance | 20 | chase roll |
| increasedCritPct | pct → increasedCritPct | 200 | common roll |
| critMultiplier | flat → critMultiplier | 2.5 | |
| damageReductionPct | flat → damageReductionPct | 50 | separate layer from DEF |

### Offense behavioral

| Stat | Hook / handler | Verdict | Notes |
|------|---------------|---------|-------|
| lifestealPct | onDealDamage / healPercent | **live** | |
| doubleStrikeChance | onAttack / doubleStrike | **live** | |
| executeThreshold | onAttack / executeKill | **live** | |
| armorPierce | onAttack / ignoreDefense | **live** | |
| manaLeechPct | onDealDamage / manaPercent | **fix + stage→live** | placeholder target `lifestealPct` → new derived `manaLeechPct`. Restores mana = X% of damage dealt. Needs live mana in combat loop (exists client-side) |
| poisonChance | onAttack / applyPoison | **fix + stage→live** | placeholder target `attack` → new derived `poisonChance`. Applies **Poison** status ([[status-effects]]) |
| poisonDamage | — (structural read) | **fix + stage→live** | → derived `poisonDamage`; the Poison magnitude calc reads it at apply time (same structural-read pattern as attackSpeedPct) — no hook dispatch |
| cleavePct | onDealDamage / cleaveAoE | **fix + stage→live** | packs exist now (D32) — TRUE adjacent-hit: X% of damage also hits the next enemy in the row. Target → derived `cleavePct` |
| critDamageBurst | onCrit / splashAoE | **retire (revisit)** | kept retired for launch; candidate revival as an epic "crits splash the row" affix once pack combat proves fun (D32 note in [[combat]]) |
| accuracy | (none) | **retire** | no miss system; dodge already owns avoidance |

### Defense & sustain behavioral

| Stat | Hook / handler | Verdict | Notes |
|------|---------------|---------|-------|
| dodgeChance | onTakeDamage / dodgeRoll | **live** | |
| thornsPct | onTakeDamage / reflectPercent | **live** | |
| blockChance | onTakeDamage / blockRoll | **live** | today block negates fully — after blockAmount goes live, block negates up to blockAmount (see next) |
| blockAmount | onTakeDamage / blockRoll | **fix + stage→live** | placeholder target `attack` → derived `blockAmount`. Rework: a successful block absorbs up to `blockAmount` damage (0/undefined = legacy full negate) |
| blockHeal | onTakeDamage / onBlockHeal | **stage→live** | heal X% maxHp on successful block; target → derived `blockHeal` |
| counterAttackPct | onTakeDamage / counterAttack | **live** | |
| critHeal | onCrit / critHealEffect | **live** | |
| reviveChance | **onLethal** / reviveRoll | **live** (hook moved) | once per fight; fires only when a hit would be lethal. Was `onTakeDamage` — probing it there re-fired dodge/block/thorns handlers (Phase 1 engine fix) |
| shieldLeechPct | onDealDamage / shieldLeech | **fix + stage→live** | needs **Shield** status; gain shield = X% of damage dealt. Target → derived `shieldLeechPct` |
| statusResist | — (structural read) | **fix + stage→live** | placeholder target `attack` → derived `statusResist`. Semantics: X% chance to fully resist any incoming status application — the status framework rolls it at apply time ([[status-effects]] resist model), no hook dispatch; `statusResistRoll` handler retired |
| healOnKillPct | onKill / healOnKill | **live** | |
| explodeOnKill | onKill / explodeAoE | **live** (monster-side) | |
| hpRegen | perTick / regenFlat | **live** | |
| hpRegenPct | perTick / regenPercent | **live** | |

### Utility behavioral

| Stat | Hook / handler | Verdict | Notes |
|------|---------------|---------|-------|
| goldFindPct | onKill / bonusGold | **live** | |
| xpBonusPct | onKill / bonusXp | **fix + stage→live** | placeholder target → derived `xpBonusPct`; +X% XP from kills (applies to server reward calc too) |
| itemDropChance | onKill / bonusDrops | **fix + stage→live** | → derived `itemDropChance`; +X% drop chance per kill |
| rareEnemyChance | perTick / rareEnemyRoll | **fix, stays staged** | not a combat stat — it's a **spawn-layer** stat (+X% elite chance next spawn). Move to spawn integration; wrong hook today |

### Combat start behavioral

| Stat | Hook / handler | Verdict | Notes |
|------|---------------|---------|-------|
| startingShield | onCombatStart / grantShield | **stage→live** | grants **Shield** status = X% maxHp at fight start; needs Shield status |
| preemptiveStrike | onCombatStart / preStrike | **stage→live** | free opening hit for X% of ATK; target → derived `preemptiveStrike` |

## Part B — NEW stats (10)

Registry-ready rows. `perBudget`/`band`/`value` are v1 guesses for the roller.

| Stat | Kind | Op → target | Hook / handler | Cap | Band (roll) | Consumers | Why |
|------|------|------------|----------------|-----|-------------|-----------|-----|
| attackSpeedPct | flat (structural) | pct-like → attackSpeedPct | — (read by combat clock) | 50 | 3–8% | dagger/bow/leather/hood/quiver pools; Haste status; Archer line | D14: interval = classBase / (1 + AS/100) |
| abilityPowerPct | flat | flat → abilityPowerPct | — (read by ability dispatch) | 100 | 4–10% | staff/orb/robe/circlet/focus pools; Apprentice line | ability damage/heal ×(1+AP/100); separates caster scaling from auto-attack |
| maxMana | flat | flat → maxMana | — | — | 8–20 | wand? (via sword family notes), orb/robe/sash pools | caster itemization |
| maxManaPct | flat | pct → maxMana | — | 60 | 5–12% | staff/circlet pools | |
| manaRegenPct | flat | flat → manaRegenPct | — (read by mana tick) | 100 | 5–15% | orb/robe/slippers pools | regen = maxMana × 4%/s × (1 + this/100) |
| cooldownReductionPct | flat | flat → cooldownReductionPct | — (read at cast) | 40 | 3–8% | circlet/arcane-band/slippers pools | attach orphan `cooldownReduction` handler concept; effective cd = cd × (1 − CDR/100) |
| manaCostReductionPct | flat | flat → manaCostReductionPct | — (read at cast) | 40 | 3–8% | sash/focus pools | attach orphan `manaCostReduction` concept |
| burnChance | behavioral | flat → burnChance | onDealDamage / applyBurn (new) | 35 | 4–10% | staff pool; volcanic monster pool; Cindersworn set | applies **Burn** ([[status-effects]]) |
| bleedChance | behavioral | flat → bleedChance | onCrit / applyBleed (new) | 50 | 6–14% | axe/bow pools; Archer line | crits apply **Bleed** — makes crit builds status-relevant |
| slowOnHitPct | behavioral | flat → slowOnHitPct | onDealDamage / applySlow (new) | 30 | 4–10% | greatsword pool; deep/abyss monster pools | applies **Slow** |
| shockChance | behavioral | flat → shockChance | onDealDamage / applyShock (new) | 35 | 4–10% | bow/arcane-band pools; Stormquiver archetype | applies **Shock** (D38 lightning) |

Registry after this pass: 41 − 2 retired + 11 new = **50 stats**
(~24 live today → ~41 live once the status framework lands).

## Part C — stat → consumer matrix (no orphans rule)

Every stat must appear in ≥1 column. Full pool assignments live in
[[gear-catalog]] (gear) and [[roster]] (monsters); this is the coverage map.

| Stat group | Gear families | Passive pools | Sets/uniques | Class kits |
|------------|--------------|---------------|--------------|-----------|
| ATK/HP/DEF/DR core | all armor + weapons | — | all sets | class bases |
| crit trio | dagger/bow/hood/signet/pendant | — | Raider's Edge | Archer line |
| attackSpeedPct | dagger/bow/leather/quiver/leggings | swarm pool | Broodwatcher set | Archer line, Haste |
| mana quartet (maxMana/Pct, manaRegenPct, manaCostReductionPct) | staff/orb/robe/circlet/sash/slippers/focus | — | Voidbound set | Apprentice line |
| abilityPowerPct | staff/orb/robe/circlet/focus | — | Cindersworn/Voidbound | Apprentice line |
| cooldownReductionPct | circlet/arcane-band/slippers | — | Voidbound | — |
| sustain (lifesteal, healOnKill, hpRegen/Pct, blockHeal, critHeal, manaLeechPct) | sword/plate/girdle/loop/talisman | undead, squire pools | Warden's Vigil | Squire line |
| avoidance (dodge, block trio, statusResist, reviveChance) | shield/leather/boots/sabatons | undead, swarm, abyss pools | Warden's Vigil | Squire line |
| aggression procs (doubleStrike, execute, armorPierce, cleave, preemptiveStrike, thorns, counterAttack) | axe/greatsword/plate | goblinoid, brute pools | Scrapper's Rig | Squire/Archer lines |
| status appliers (poison duo, burnChance, bleedChance, slowOnHitPct) | axe/bow/staff | volcanic, deep pools | Cindersworn | all lines |
| shields (startingShield, shieldLeechPct) | orb/talisman | abyss pool | Voidbound | Apprentice line |
| economy (goldFindPct, xpBonusPct, itemDropChance) | boots/quickbelt/loop | — | Scrapper's Rig | — |
| spawn-layer (rareEnemyChance) | quickbelt (later) | — | — | — (needs spawn integration) |

## Implementation notes

- The 12 **fix** stats all follow one pattern: give the stat its own DerivedId
  instead of the placeholder `target: 'attack'`, add the id to `DERIVED_IDS`,
  flip `implemented: true` once its handler/status lands
- New handlers needed: `applyBurn`, `applyBleed`, `applySlow` (thin wrappers
  that emit a status application — see [[status-effects]] framework spec)
- `attackSpeedPct`, `abilityPowerPct`, mana quartet, CDR are **structural
  reads**, not hook dispatches — the combat clock / ability dispatch reads the
  derived value directly (same pattern as `attack`/`maxHp` today)

## Related

- [[status-effects]] · [[gear-catalog]] · [[class-kits]] · [[roster]]
- [[DECISIONS]] D14, D23-D25
