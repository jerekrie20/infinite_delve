---
tags: [mechanic]
status: planned
depends-on: [delve-generation]
---

# 06 · The Frontier (community meta)

**Decided: shared boss ladder** (D20 in [[DECISIONS]]). The shared layer —
every solo run feeds the sub's war. "Solo in the small, together in the
large."

## The boss ladder (D20)

- Each season, the sub faces a **ladder of frontier bosses** (~8-12,
  culminating in a Season Titan)
- **Every run converts to frontier damage**, scaled by depth reached (deeper
  floors = more damage; boss kills = bonus damage). Daily Delve runs count
- Boss HP scales with the sub's **active delver count** (rolling average) so
  a 20-person sub and a 20k-person sub both get a real fight
- **Felling a boss** →
  - sub-wide buff for N days (e.g. +5% gold find) — visible thank-you
  - celebration event post (auto-posted, top contributors named)
  - next boss revealed
- Progress bar always visible (Daily panel + splash): boss art, HP remaining,
  today's damage, top damagers

## Season structure (D21)

- Season = ~4 weeks. Win = fell the Season Titan before reset
- Reset: fresh ladder + empty seasonal boards. Heroes/masteries/gear persist
- Seasonal cosmetic stamps for contributors + top delvers
- **Sub vs sub** (phased): global ladder ranking subs by frontier progress
  (size-normalized). Blocked on Devvit cross-installation data plumbing —
  design the single-sub game to stand alone first

## What exists (parked meta code)

`frontier.ts` already aggregates per-day depth totals + a leaderboard + a
goal/pct snapshot. The boss ladder reuses this pipeline: depths → damage,
goal → boss HP, day close → damage rollup. Scheduler + daily report exist.

## Season rewards (cosmetic/status only, D2)

| Tier | Threshold (per season) | Reward |
|------|------------------------|--------|
| Delver | any frontier damage | season-stamped participation flair |
| Veteran | damage on ≥14 days | flair upgrade + base-camp banner cosmetic |
| Vanguard | top 10% damage in sub | hero skin variant (season-exclusive) |
| Terror-Slayer | present (damaged that boss) on a fell day | per-Terror badge, collectible |
| The Guild | Season Titan felled | sub-wide celebration cosmetic + trophy post |

Formulas for damage, soft caps, and boss HP live in [[FORMULAS]] (normative).
Terror naming per season: [[WORLD]].

## Contribution rules

- Damage from: depths cleared (any run type: live, daily, offline expedition)
- Anti-degenerate: damage counts on extract OR death (you fought either way),
  but daily damage per player caps softly so botting one account can't carry
- Requires the server-verification path ([[combat]] determinism) before
  frontier rewards get valuable

## Related

- [[reddit-native]] — the posts this generates · [[delve-generation]]
- [[DECISIONS]] D20, D21
