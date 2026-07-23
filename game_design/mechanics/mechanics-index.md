---
tags: [overview]
status: living
---

# Mechanics — index & tracker

Design order = dependency order. As of 2026-07-21 the design is **fully
decided end-to-end** — see [[DECISIONS]]. Status now tracks build state
against that plan.

## The stack

| # | Mechanic | Design | Build | Notes |
|---|----------|--------|-------|-------|
| 00 | [[core-run]] | ✅ decided | 🔨 partial | built: lane + every-kill choice; target: checkpoints, choice-at-5s, automation ladder |
| 01 | [[classes]] | ✅ decided | 🔨 partial | Squire base only; target: 3 chains × 3 stages, mastery system |
| 02 | [[monsters]] | ✅ decided | 🔨 partial | engine built; roster stops at depth 29 vs endless map |
| 03 | [[combat]] | ✅ decided | 🔨 partial | hooks built; framework (attack speed + statuses + seeding) pending |
| 04 | [[loot-gear]] | ✅ decided | 🔨 partial | generation built; level-reqs, crafting, stash pages, consumables pending |
| 05 | [[delve-generation]] | ✅ decided | 📝 minimal | scaling built; Daily Delve + offline sim + modifiers pending |
| 06 | [[frontier]] | ✅ decided | 📝 parked | aggregate pipeline exists; boss ladder pending |
| 07 | [[economy]] | ✅ decided | ❌ none | gold exists, zero sinks built |
| 08 | [[onboarding]] | ✅ decided | ❌ none | blocked on classes (which block on combat framework) |
| 09 | [[reddit-native]] | ✅ decided | 📝 parked | scheduler/report scaffolding exists |
| 10 | [[hero-progression]] | ✅ decided | 🔨 partial | XP/levels built at old cap; gates/masteries/passive-slots pending |
| 11 | [[home-base]] | ✅ decided | ❌ none | Torchrest hub — sinks as buildings, decoration = mtx surface (D43) |

## Build order (dependency-driven)

```
1. Combat framework (per-side timers + statuses + seeded RNG)   ← unblocks nearly everything
2. Checkpoints + choice-at-5s restructure (core-run)
3. Archer + Apprentice base kits, class select, onboarding
4. Automation ladder tiers 1-3 + consumables + gold sinks
5. Chains: promotions, stage kits, first mastery end-to-end
6. Server run-sim → offline expeditions (automation tier 4)
7. Daily Delve (needs seeded combat + one-attempt enforcement)
8. Frontier boss ladder + reddit-native calendar
9. Seasons + modifiers; sub-vs-sub last
```

## Content catalogs (authored 2026-07-21 — implementation-ready specs)

- [[stats-catalog]] — 50-stat registry: 41 audited (keep/fix/retire) + 11 new
- [[status-effects]] — framework spec (incl. generic StatMod) + 16 statuses, element tags
- [[class-kits]] — 60 abilities (3 chains × 5 slots × 4 options), pools, intervals
- [[build-theory]] — the 7 power layers, 9 named archetypes, status-synergy map
- [[gear-catalog]] — 33 bases across slot families, 6 sets, 12 uniques, consumables, salvage crafting
- [[roster]] — monsters to depth 60: 18 templates + 6 bosses (cooldown signatures), affinities, packs

## Related

- [[Home]] · [[DECISIONS]] · [[ARCHITECTURE]] · [[MIGRATION]]
- Companions: [[FORMULAS]] · [[DATA_SCHEMA]] · [[WORLD]] · [[METRICS]] ·
  [[RELEASE_PLAN]] · [[ART_BIBLE]] · [[asset-manifest]] · [[audio]]
