---
tags: [mechanic]
status: planned
depends-on: [core-run, combat]
---

# 05 · Delve Generation & the Daily Delve

"Generation" in the lane format = depth scaling, spawn sequences, and seeds.
The headline feature here is the **Daily Delve** (D22 in [[DECISIONS]]).

## Built

Depth-based stat scaling · template selection by depth range · elite chance
per depth · passive budget per depth · loot budget per depth. All pure
functions that accept an `Rng`.

## Target — the Daily Delve (D22)

- **One shared seed per day** → identical monster sequence, passives, and
  drop rolls for every player
- **One attempt per day** (server-enforced; run start registers the attempt)
- **Real hero** — your grown power is part of your rank
- **Depth leaderboard per sub** (exists in parked meta code), global
  percentile later
- Requires **fully seeded combat** ([[combat]] determinism) — without it the
  shared seed is a lie
- Daily Delve runs also count toward frontier damage (D20) — never a choice
  between personal and community play

**Rules detail (locked this pass):**

- **Seed rotation**: UTC midnight, all subs (dayKey already UTC-based)
- **Attempt registration**: the attempt is consumed at RUN START
  (`daily:{dayKey}:attempt:{userId}` stamped, [[DATA_SCHEMA]]) — closing the
  app mid-run does not grant a redo; the abandoned run scores its depth
  reached so far
- **Starting depth**: always depth 1 — the daily is the one place everyone
  runs the same gauntlet (checkpoints don't apply; automation MAY apply,
  it's account power like gear)
- **Tie-breaks**: depth desc → total damage taken asc → earlier submission
- **Rewards**: cosmetic/status only (D2): daily podium flair in the report,
  weekly consistency flair (5+ dailies), season-end percentile cosmetic.
  Never gold, never gear
- **Verification**: daily runs are the FIRST runs to get replay
  verification (small volume, high stakes)

## Target — offline expedition generation (D19)

Offline runs are real simulated runs: seed per expedition, same spawn/loot
engine, policy-driven decisions (start checkpoint, extract-at depth,
consumables, auto-cast policy). The server sim and the live client run THE
SAME shared code — one combat engine, no drift.

## Target — event floors (D42)

~1 in 8 non-boss, non-mini-boss floors ⚙ rolls an EVENT instead of a fight
(seeded, so Daily Delve events are identical for everyone):

| Event | What happens |
|-------|-------------|
| **Shrine** | tap → run-long boon (small StatMod: +ATK / +AS / +goldFind) |
| **Gamble Altar** | offer 15% current HP → receive a chest (rarity-weighted at depth) |
| **Treasure Cache** | choice of 2 revealed items — take one, leave one (the only place loot is CHOSEN) |
| **Lore Encounter** | drawn from the ~20 authored scripts in [[LORE]] (tiered 🕯️/🧩/🔦; 🔦 rare + deep-band only) + tiny reward; three carry secret-deed hints (D37) |

Events auto-resolve sensibly under rotation/offline play (shrine: take it;
altar: policy flag greedy/safe; cache: higher gearScore) — but resolving
them BY HAND is part of active play's charm.

## Glossary — personal vs shared (terminology, locked)

| Term | What it is |
|------|-----------|
| **Delve** (personal) | your anytime endless run: pick checkpoint, push, extract. Your loot, your board entry, unlimited |
| **Daily Delve** | ONE attempt/day on the shared seed, depth-1 start, per-sub leaderboard. Same word, capital D — "did you do your Daily?" |
| **The Frontier** | NOT a mode — the passive rollup: every run of any kind converts to damage against the sub's current Terror (D20). You never "enter" it; you contribute by playing |
| **Expedition** | an offline, server-simulated personal Delve (D19) |
| **Trial** | a Temple boss room for promotion/mastery (D36) — separate from all of the above, no loot stakes |

## Target — modifiers

- **Seasonal modifier** (D21) — one rule twist per season, global
  ("elites everywhere", "gold rush", "cursed floors: +loot −healing")
- **Daily mutators** (later) — small spice on the daily seed
- Modifiers are data: a TUNING overlay applied at run creation

## Endless scaling (D6)

Authored themes to ~100; past that, procedural variants (theme remix, richer
passive budgets, compounding stat scale). The deep-push ladder needs the
scaling curve rework flagged in [[monsters]].

## Related

- [[combat]] — seeded engine · [[frontier]] — damage rollup
- [[DECISIONS]] D6, D19, D21, D22
