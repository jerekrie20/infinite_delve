---
tags: [mechanic]
status: built-v1 (Phase 1 2026-07-22 — engine in src/shared/combat/; boss
  rooms/signatures + support monsters + affinity potency are Phase 2)
depends-on: [core-run, monsters]
---

# 03 · Combat — model v2 (rotation + packs + boss rooms)

Redesigned in the final interview pass (D30-D32, D33/D35 in [[DECISIONS]]).
The hook/handler system stays the engine; on top of it: per-entity timers,
a player-authored rotation, 1-3 enemy packs in rows, and active boss rooms.

## The combat model (target)

**Normal floors — the rotation plays, you supervise.**
- **Slot 1 is your basic attack** (D30): the chosen option is your repeating
  strike — no mana, fires every attack-speed interval
- **Slots 2-5 are mana abilities** fired by the **rotation**: a player-
  ordered priority list (drag to reorder at base). Each beat, the highest-
  priority ability that's off cooldown and affordable casts; otherwise the
  basic attack fires
- Manual casts may always interleave (tap = queue it next) — you can grab
  the wheel any time; that's the "turn it around" feel
- Casts resolve on the attack beat (queued, D33) — one deterministic code
  path for live play, rotation, and server sim

**Boss floors — the door, the room, your hands (D31).**
- Boss floors transition into a **boss room** (doused torches, name banner)
- The rotation is fully capable of fighting bosses (offline runs and
  auto-continue work everywhere) — but manual play is meaningfully better
  (~20-30% ⚙): timing the stun against the signature wind-up, holding the
  guard ability for the signature wind-up, popping the ult right after it
- Signature moves telegraph with a one-beat wind-up — the counterplay IS
  the ability timing

**Packs — 1-3 enemies in rows (D32).**
- Melee occupy front slot(s); ranged/casters sit in a back slot and attack
  from range. Composition by monster kind ([[roster]]): brute alone, grunts
  in pairs, swarm 2-3, caster = backline behind a bodyguard; bosses solo
  or +1 add
- Hero auto-targets front-most. Target CHOICE comes from ability targeting
  types — `front` / `all` / `back-row` / `random` — never tap-targeting
- **Floor budget**: one stat+reward budget per depth, split across the pack
  (+~15% pack bonus ⚙, [[FORMULAS]]) — packs change texture, not economy

## Timing model (the thing to nail — D32)

- Every entity owns an **independent attack timer**: `classOrTemplate
  interval ÷ (1 + attackSpeedPct/100)`, ticked on a **100ms combat clock**
- No shared exchange beat — a 1.5s Archer weaves between a 2.6s brute and
  a 3.2s backline caster; **Slow/Haste** modify timers directly
- Statuses tick on the 1s sub-clock (unchanged from [[status-effects]])
- Everything draws from the run's seeded Rng — bit-exact replay for Daily
  Delve, expeditions, and verification

## Built today (kept as the engine underneath)

- Damage: `ATK × (1 − DEF%/100) × (1 ± variance)`, min 1; crit via PoE
  model. **Variance: ±5%** (D35, was ±10%)
- Hook system: 7 points, 29 handlers, symmetric hero/monster dispatch —
  unchanged; packs mean hooks dispatch per-entity
- Mana: regen 4%/s × (1 + manaRegenPct); costs/cooldowns per [[class-kits]]

## Pack ripples on stats ([[stats-catalog]] re-audit)

- **cleavePct** reverts to TRUE adjacent-hit (X% of damage hits the next
  enemy in row) — the overkill-carryover rework is dead
- **explodeOnKill** (monster) now also threatens pack dynamics near the hero
- **splash/critDamageBurst** (retired) — candidate for revival as an
  epic-tier "crits splash the row" affix once packs prove fun; keep retired
  until then
- Back-row reach: `armorPierce`-family and `back-row` targeted abilities
  are the anti-backline tools

## Readability (D34/D35)

- **Elite/boss passive badges at spawn** — small icons by the name plate
  ("Thorned · Undying"), same 24px icon language as statuses
- **Death recap card**: killer + its passives, last 3 exchanges, what was
  lost (haul list, unbanked gold), depth vs record
- Max 3 enemies + hero = 4 HP bars; float-text budget capped (merge DoT
  ticks into 1s sums)

## What this changes elsewhere

- [[class-kits]]: slot-1 options rebalanced to mana-free attack styles;
  rotation replaces per-ability auto-cast tags
- [[core-run]]: automation tier 2 re-scoped to **rotation conditionals**
  (rules like "Guard ability when HP < 50%")
- [[roster]]: pack composition per kind; [[FORMULAS]]: floor budget + timing
- Flee: between fights only (D33) — never mid-fight

## Related

- **Catalogs: [[stats-catalog]] · [[status-effects]] · [[build-theory]]
  (how it all stacks into builds; element tags D38)**
- [[class-kits]] — the kits this executes · [[roster]] — pack composition
- [[DECISIONS]] D14, D30-D35 · [[FORMULAS]] — budgets and rates
