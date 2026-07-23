---
tags: [formulas, tuning]
status: living
---

# Formulas — the single source of truth for every number

Normative (see [[DECISIONS]]): if any doc or code comment disagrees with
this file, THIS file wins. Every formula lands in `TUNING`/content data; the
balance sandbox tunes the constants, this doc owns the *shapes*. Values
marked ⚙ are sandbox-tunable v1 guesses.

## Hero

- **XP to next level**: `xpToNext(L) = 20 × L^1.5` ⚙ *(current curve, kept)*
- **Level cap**: 70 per chain; promotion gates at **L25** and **L45** (D9)
- **Pacing check** (validates D11): total XP 1→70 ≈ 330k. At ~150 kills/hr
  active around depth 25 (~70 XP/kill EV) ≈ 10.5k XP/hr → **~31 active
  hours ≈ 3-4 weeks** at 1-1.5 hr/day ✅
- **Class base stats + intervals**: table in [[class-kits]] (normative there;
  they're content, not curves)
- **Mana**: `maxMana = classBase + perLevel×(L−1)`; regen
  `4%/s × (1 + manaRegenPct/100)`
- **Attack interval**: `classIntervalMs / (1 + attackSpeedPct/100)`,
  attackSpeedPct hard cap +50 ⚙ (floor 1.0s absolute)
- **Mastery bonus**: **+2.5% ATK and +2.5% maxHp per mastery**, account-wide,
  additive with each other, applied after the gear fold ⚙ (D10 band 2-3%)

## Monsters (rework of current linear-only scaling)

For depth d, with base linear ramp `lin(d) = base + perDepth × min(d, 30)`:

- **HP**: `hp(d) = (7 + 2.2×min(d,30)) × 1.035^max(0, d−30) × statMult × rarityMult` ⚙
- **ATK**: `atk(d) = (2 + 0.5×min(d,30)) × 1.03^max(0, d−30) × …` ⚙
- **Rewards grow SLOWER than stats** past 30 (deep pushing is for gear/
  ladder, not gold printing):
  `gold(d) = (3 + 2×min(d,30)) × 1.02^max(0, d−30) × …` ⚙, XP same shape
- **Rarity multipliers**: elite 3.5×HP/1.5×ATK/4×reward · boss 10×/2.5×/12×
  *(current values; boss retune is a Phase 2 sandbox task — the depth-5
  boss spike must die)*
- **Elite chance**: `5% + 0.1%/depth, cap 40%`; **mini-boss floors (every
  5th, non-boss)**: forced elite + one extra passive tier
- **Floor budget (D32)**: a depth's hp/atk/reward values above define ONE
  floor total. A pack of n enemies splits it: each gets
  `budget × packShare(n) / n` where `packShare = 1 / 1.15^0 …` i.e. total
  pack budget = `floorBudget × (1 + 0.15×(n−1))` ⚙ (packs slightly harder
  AND slightly richer, never n×). Composition by kind: brute = solo ·
  grunts = 1-2 · swarm = 2-3 · caster = backline + 1 bodyguard · boss =
  solo or +1 add
- **Combat clock (D32)**: 100ms global tick; each entity attacks every
  `interval ÷ (1 + attackSpeedPct/100)`; statuses tick on the 1s sub-clock.
  Damage variance **±5%** (D35)
- **Manual-advantage target (D31)**: rotation-only clears at-level content;
  manual boss play yields ~20-30% better outcomes ⚙ (measured in the sim
  as time-to-kill + damage-taken deltas)
- **Reward EV rule**: server reward math uses EXPECTED value (elite chance ×
  elite mult folded in analytically) — never a live rarity roll (audit fix)

## Runs & idle

- **Checkpoint unlock**: fell boss at depth 10k → start-at depth `10k+1`
- **Idle trickle (pre-automation)**: `goldEV(bestDepth) / 60 per second`,
  cap 8h *(current, but EV — see reward rule)*
- **Offline expeditions**: real sim — no formula shortcuts; results ARE the
  sim output (D19). Expedition count/window: tier 4 = 3 runs/8h ⚙, tier 5
  upgrades +2 runs & +4h per rank ⚙

## Gear

- **Item budget**: `(3 + 0.8×d) × rarityMult` ⚙ (current);
  2H weapons ×1.6 budget (D23)
- **Rarity statMults**: 1.0 / 1.4 / 1.9 / 2.6 / 3.6 (current)
- **Level requirement**: `req = clamp(round(0.75 × dropDepth), 1, 70)` (D15)
- **Sell value**: `gearScore × 0.5` (current)
- **Drop chance**: 20%/kill, swarm ×2 (current); set chance 5%+0.05%/d cap
  15%; unique 1%+0.02%/d cap 5% (current)

## Economy — faucet/sink flow model ⚙

Reference rates (active play, EV, at the player's wall depth W):

| W (wall) | gold/kill EV | kills/hr | gold/hr |
|----------|--------------|----------|---------|
| 10 | ~30 | ~180 | ~5.4k |
| 25 | ~69 | ~150 | ~10k |
| 40 | ~90 | ~120 | ~11k |

Sink prices sized so each is ~1-3 hours of income at the depth where it
unlocks (a *current thing to save for* at every account age):

| Sink | Price shape ⚙ |
|------|---------------|
| Automation T1 auto-continue | 2,000 (unlocks after first boss; ~30-60 min) |
| T2 auto-cast | 8,000 (~L20) |
| T3 auto-extract | 25,000 (~L25) |
| T4 expeditions | 80,000 (~L45 — the big save-up) |
| T5 capacity rank n | 50,000 × n |
| Consumables | 30-150/run (see [[gear-catalog]]) × (1 + startDepth/20) |
| Stash page n | 500 × n |
| Reroll values / one affix | 50 / 120 × rarityMult × (1 + req/10) |
| Rarity upgrade | 400 × newTierMult; epic→legendary 4,000 flat |

Solvency rule: at any wall depth, (consumables for a session + one crafting
action) < 40% of a session's income — checked in the sandbox.

## Events, trials & elements (D36-D42)

- **Event floor rate**: 12.5% (1-in-8) of non-boss, non-mini-boss floors ⚙,
  seeded per run. Gamble Altar: 15% current HP → chest at depth-scaled
  rarity ⚙. Shrine boons: +8% ⚙ to one of ATK/AS/goldFind for the run
- **Theme affinity**: resisted tag = status potency ×0.75 · vulnerable =
  ×1.25 · immune = no application ⚙ (table in [[roster]])
- **Trial bosses (D36)**: statline = the gate-depth boss (L25 gate ≈ depth
  ~20 boss, L45 ≈ depth ~40, capstone ≈ depth ~60) with rewards = none but
  promotion; retry freely, no loot stakes
- **Boss signatures (D39)**: cooldown 10-15s ⚙ per boss, first firing ≥5s
  into the fight; wind-up telegraph = 1 attack beat
- **Essences (D44)**: salvage yields `1 + affixCount` essences of item
  rarity ⚙; down-tier conversion 4:1, no up-tier. Solvency: a session of
  salvaging at your wall should fund ~2 rerolls at that tier ⚙
- **Unique pity (D46)**: 1 theme-fragment per boss kill, ~35 ⚙ craft a
  chosen unique of that theme → worst-case chase ≈ 35 boss kills ≈ a few
  days of farming a band; RNG (1-5% per drop) usually beats the bar
- **Codex (D45)**: guild completion % = mean of members' codex %; deed
  thresholds authored with content ([[PLAYBOOK]] step)

## Frontier & meta (D20-D22)

- **Frontier damage per run**: `depthsCleared + 3 × bossKills` ⚙ (any run
  type; on extract or death)
- **Soft daily cap per player**: contributions beyond the player's best-3
  runs/day count 25% ⚙ (anti-bot, doesn't punish honest grinders)
- **Boss HP**: `40 × activeDelvers(7d avg, min 3) × ladderIndex^1.4` ⚙ —
  the min-3 floor keeps 2-player subs winnable (cold start)
- **Sub-wide buff on fell**: +5% goldFind, 3 days ⚙
- **Daily Delve tie-breaks**: depth desc → total damage taken asc → earlier
  submission. Rewards: flair/cosmetic only (D2)

## Format rule

All player-facing numbers ≥10,000 render short-form (12.3K, 4.5M) — one
`formatShort()` (exists in `ui/hud.ts`), used everywhere.

## Related

- [[DECISIONS]] · [[class-kits]] (class tables) · [[gear-catalog]] (item
  tables) · [[roster]] (monster base stats) — those hold CONTENT values;
  this holds CURVES and cross-system rates
