---
tags: [catalog, combat]
status: built-v1 (Phase 1 2026-07-22 — src/shared/combat/statuses.ts holds
  all 16 presets; sources for Mark/Curse/Undying etc. arrive with their
  Phase 2/3 content; theme-affinity potency wiring is Phase 2)
depends-on: [combat]
---

# Status Effects Catalog — the framework + all 16 statuses

**Element tags (D38):** every status/ability carries at most one element —
fire→Burn · ice→Slow · lightning→Shock · dark→Curse · nature→Poison ·
physical→Bleed/Stun. Monster themes resist/amplify tags ±25% potency ⚙
(affinity table in [[roster]]). Tags are metadata on existing rows — no
damage-type matrix exists.

The unified buff/debuff/DoT system decided in D14 ([[DECISIONS]]). This doc is
the implementation contract: the framework spec, then every status the launch
game needs with first-draft numbers (**sandbox-tunable v1**). Abilities in
[[class-kits]] and monsters in [[roster]] reference these by name.

## Framework spec

```ts
interface Status {
  id: StatusId;          // 'stun' | 'poison' | ... (14 below)
  side: 'hero' | 'monster';
  magnitude: number;     // meaning per-status (dmg/s, %, absorb pool…)
  remainingMs: number;
  stacks: number;        // 1 unless the status stacks
  source: string;        // abilityId | statId | monster templateId (for UI/debug)
}
```

Rules:

- **Tick cadence**: statuses tick on the existing 1s combat tick (same
  accumulator as hpRegen/mana). DoT damage, Regen healing, and duration
  decrement happen there. Modifier statuses (Slow, Weaken, Mark…) don't tick —
  they're read at the point of use (attack roll, damage calc, combat clock)
- **One instance per (id, side)**: re-application follows the status's stack
  rule below — never two separate Poison entries on one side
- **Stack rules** (per status): `refresh` (reset duration, keep magnitude ·
  take the higher magnitude), `stack` (stacks += 1 up to max, refresh
  duration), `extend` (add duration up to a cap)
- **Resist model**: on any application to a side with `statusResist` > 0, roll
  once — resisted = no application, show "RESIST" float. Buffs self-applied are
  never resisted
- **Boss stun rule**: bosses have innate 40% statusResist vs **stun only**,
  and each successful stun within 10s halves the next stun's duration
  (1.5s → 0.75s → 0.38s…). Prevents perma-stun; other statuses land normally
- **Cleanse on transition**: all statuses clear on monster death (hero keeps
  self-buffs), on run reset, and on extract
- **Determinism**: all rolls draw from the run's seeded Rng — required for
  Daily Delve / offline sim / verification (see [[combat]])
- **HUD**: icon row under each HP bar; stacked statuses show a count badge;
  durations as radial sweep. Cap display at 6 icons (overflow "+N")
- **Cap**: max 8 active statuses per side; new applications beyond that are
  dropped (oldest debuff is NOT displaced — keeps it simple and ungameable)

## The catalog

Magnitudes reference ATK = attacker's attack, maxHp = owner's max HP.

### Damage over time (tick on the 1s clock)

| Status | Magnitude (v1) | Duration | Stack rule | Sources | Counterplay |
|--------|----------------|----------|-----------|---------|-------------|
| **Poison** | 8% of applier ATK /s per stack (+`poisonDamage`% more) | 6s | stack, max 5 | `poisonChance` stat (axe pool, Archer "Poison Tips"), warrens monsters | statusResist; short fights |
| **Burn** | 40% of applier ATK /s | 3s | refresh (higher magnitude wins) | `burnChance` stat (staff pool), Apprentice fire abilities, volcanic monsters | statusResist; high burst magnitude but no stacking |
| **Bleed** | 25% of the triggering hit /s | 4s | stack, max 3 | `bleedChance` stat (crit-triggered; axe/bow pools), Archer abilities | statusResist; dodge the trigger hit |
| **Shock** ⚡(D38) | next damage taken +25% per stack (consumed by that hit) | 4s | stack, max 3 | `shockChance` stat (bow/arcane-band pools), lightning abilities | statusResist; the setup-then-payoff element — synergy map in [[build-theory]] |

Poison = slow ramp that rewards fast attacks (stacks). Burn = big flat DoT
for slow casters (refresh). Bleed = scales with hit size, crit-gated.

### Hard control

| Status | Magnitude | Duration (v1) | Stack rule | Sources | Counterplay |
|--------|-----------|---------------|-----------|---------|-------------|
| **Stun** | — (skip all attacks while active) | 1–3s per source | extend, cap 4s | Squire "Stunning Bash"/"Skullcrack", Mage "Ice Nova"/"Absolute Zero", abyss monsters | statusResist; boss stun rule above |

### Stat debuffs (read at point of use)

> **Implementation note — the generic StatMod status.** Every named entry in
> this section and the buffs section is a *preset* of one generic
> implementation: `statMod { target: DerivedId, delta, remainingMs }`.
> Abilities may also define ad-hoc StatMods with the same machinery (Tumble
> +dodge, Focus +increasedCrit, Arcane Intellect +abilityPower, Perfect Draw
> +critMult/+AS in [[class-kits]]). Build ONE mechanism; the names below are
> data rows, and any derived stat becomes buffable for free.

| Status | Magnitude (v1) | Duration | Stack rule | Sources | Counterplay |
|--------|----------------|----------|-----------|---------|-------------|
| **Slow** | −20-40% attack speed | 4-6s | refresh | `slowOnHitPct` (greatsword), Frost abilities, deep monsters | statusResist |
| **Weaken** | −15-25% ATK | 5-8s | refresh | Squire "Taunting Shout", Curse of Decay, crypt monsters | statusResist |
| **Armor Break** | −10-20 flat DEF% (floor 0) | 6-8s | refresh | Squire "Crushing Blow"/"Sunder", brute monsters | statusResist |
| **Mark** | +25-50% damage taken from all sources | 6-8s | refresh | Archer "Hunter's Mark"/"Marked for Death" (chain signature) | statusResist; kill the marker fast |
| **Curse** | −50% healing received | 8s | refresh | Apprentice "Curse of Decay", undead/crypt monsters | statusResist; the anti-sustain answer to lifesteal builds |

### Buffs (self-applied, never resisted)

| Status | Magnitude (v1) | Duration | Stack rule | Sources |
|--------|----------------|----------|-----------|---------|
| **Fortify** | −30-50% damage taken | 3-5s | refresh | Squire slot-2 abilities (replaces today's hard-coded LaneScene check) |
| **Rage** | +25-40% ATK | 5-8s | refresh | Squire "War Banner"/"Berserk", brute elites |
| **Haste** | +20-40% attack speed | 4-6s | refresh | Archer "Adrenaline"/"Wind Chaser", swarm elites |
| **Regen** | heal X/s (ability-defined) | 5-10s | refresh | consumables, Squire-line sustain options |
| **Undying** | HP cannot drop below 1 | 5s | refresh | Knight "Last Stand" only (rare by design — the anti-frustration ultimate) |

### Shield (special)

| Status | Magnitude | Duration | Stack rule | Sources |
|--------|-----------|----------|-----------|---------|
| **Shield** | absorb pool (points); damage depletes it before HP | until broken or fight ends | `extend`-style: new shield adds to pool, cap 50% maxHp | `startingShield`/`shieldLeechPct` stats, "Mana Shield"/"Shield Wall"/"Aegis Oath", abyss monsters |

Shield renders as a grey overlay segment on the HP bar, not an icon.

## Migration notes

- Delete the `activeBuffs`/`ActiveBuff` array and the hard-coded
  `abilityId === 'fortify'` check in `LaneScene.doMonsterAttack` — Fortify
  becomes status #10
- The monster "revive" passive stays a **handler** (instant, not duration) —
  not everything is a status; the framework is only for timed effects
- Handlers gain one new capability: returning `applyStatus: {id, magnitude,
  durationMs}` in `HandlerResult`, dispatched by the combat loop

## Related

- [[stats-catalog]] — the stats that apply these · [[class-kits]] — the
  abilities that apply these · [[roster]] — monster users
- [[DECISIONS]] D14
