---
tags: [metrics]
status: living
---

# Metrics — what "fun is proven" means in numbers

The vault's rule is "do a visual pass when a system is proven fun" and the
roadmap gates phases on the core being fun — this doc defines *proven*.
Also the business layer: Reddit Developer Funds pays on daily qualified
engagers + installs, so honest daily habit IS the revenue metric.

## Milestone gates (paired with [[RELEASE_PLAN]])

| Gate | Signal (self/playtesters first, telemetry later) |
|------|--------------------------------------------------|
| **Loop is fun** (after TODO Phase 2) | You personally play runs you don't have to. Median session ≥ 8 min, ≥3 runs/session. Extract rate in the 40-70% band (below = no fear, above = no greed — the choice must be real) |
| **Classes are fun** (after Phase 3) | Playtesters disagree about which class is best. Each class's option-1 loadout clears its level-appropriate wall |
| **Economy holds** (after Phase 4) | Nobody is gold-capped with nothing to buy; solvency rule in [[FORMULAS]] passes in the sandbox AND in play |
| **Mastery pull works** (after Phase 5) | ≥50% of testers who finish chain 1 start chain 2 unprompted |
| **Launch-ready** (after Phase 7) | Daily Delve participation ≥40% of DAU; crash-free sessions ≥99% |

## Core KPIs (post-launch)

- **DQE/DAU** — the Developer Funds number; target: Daily Delve makes ≥40%
  of DAU qualified daily
- **Retention** D1 ≥ 35%, D7 ≥ 15%, D30 ≥ 8% (idle-genre respectable ⚙)
- **Runs/day per active** ≥ 4 · **median run length** 3-8 min
- **Extract rate** stays 40-70%; **median death depth ÷ wall depth** ≈
  0.9-1.1 (players die pushing, not to spikes — spike deaths at boss floors
  show up here)
- **Automation adoption**: T1 within 3 days of eligibility for ≥60% (sinks
  priced right)
- **Frontier participation** ≥ 50% of WAU contribute damage ≥3 days/week
- **Install echo**: installs attributed to event posts (boss-felled,
  finale) — the D21 sub-vs-sub case rests on this

## Event log (client → server, batched; the minimum schema)

`run_start {startDepth}` · `checkpoint_choice {depth, choice, unbankedGold,
haulCount}` · `run_end {outcome, depthReached, durationMs}` ·
`ability_cast {id}` (sampled 10%) · `death {depth, killerTemplate,
killerRarity}` · `level_up {level}` · `promotion/mastery {node}` ·
`purchase {sink, price}` · `daily_attempt {depth}` · `expedition_result
{outcome, depth}` · `session {lengthMs, runs}`

Constraints: Devvit has no analytics service — events aggregate into
per-day Redis hashes (counts/histograms, no per-user tracking beyond what
gameplay already stores), surfaced through a `?debug=1` stats view and the
daily report job. Privacy: aggregate only; no external beacons (D2 trust
posture extends to data).

## Anti-metrics (things we refuse to optimize)

Session length via friction (tap-taxes), FOMO timers beyond the one daily
attempt, purchase conversion (nothing progression-priced is for sale — D2).

## Related

- [[RELEASE_PLAN]] · [[FORMULAS]] (solvency + pacing checks) · [[DECISIONS]] D2
