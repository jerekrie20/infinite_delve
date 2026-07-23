---
tags: [release, roadmap]
status: living
---

# Release Plan — milestones, seasonal cadence, operations

How the decided game ([[DECISIONS]]) ships and keeps shipping. Build order
lives in `TODO.md`; this doc owns the GATES between build phases, what a
season delivers forever after, and the operational policies.

## Milestones

| Milestone | Contents (TODO phases) | Gate to pass ([[METRICS]]) |
|-----------|----------------------|---------------------------|
| **M0 — Sound foundation** | Phase 0-1: audit fixes + combat framework | tests green; seeded sim reproduces a run bit-exact |
| **M1 — Vertical slice** | Phase 2-3 core: checkpoints, depth map to 30, Squire chain playable to L45, class select w/ all 3 base kits, status HUD, first balance pass | "Loop is fun" + "Classes are fun" gates |
| **M2 — The idle game** | Phase 4-5: economy sinks, automation T1-3, gear families+crafting, full chains + first mastery end-to-end | "Economy holds" + "Mastery pull" gates |
| **M3 — Launch** | Phase 6-7: expeditions, Daily Delve, verification; art manifest phases 1-4; SFX; onboarding polish | "Launch-ready" gate; content: 3 chains × option-2, depths to 50, 4 sets, 8 uniques |
| **Season 1** | Phase 8: frontier ladder, reports, event posts, season reset + modifier | frontier participation gate; sub-vs-sub EXCLUDED (needs cross-install plumbing) |

**Vertical slice definition (M1)** — the smallest thing that proves the
game: one class chain playable manual-only to stage 2, checkpoint runs
against 3 themed depth bands, statuses visible, no economy beyond selling.
If M1 isn't fun, nothing after it matters — stop and retune, don't build
forward.

## Seasonal content cadence (the forever plan, D12/D21)

Each ~4-week season ships a fixed-size content packet — sized to be
authorable in well under a season using the catalogs as templates:

| Every season | Doc that templates it |
|--------------|----------------------|
| 1 **branch node** for one chain (a new stage-2/3 alternative = 5-8 abilities) | [[class-kits]] grid pattern |
| 1 new **set** + 2 **uniques** | [[gear-catalog]] roadmap rows |
| 1 **seasonal modifier** | [[delve-generation]] modifiers |
| 1 frontier **Terror ladder** + finale posts + Terror lore per the season arc | [[frontier]] · [[WORLD]] names · [[LORE]] arc (S1 Gnawing → S2 Procession → S3 Announcement) |
| (every 2-3 seasons) 1 new **depth theme** (+10 depths, 3 templates + boss + backdrop + set) | [[roster]] pattern |

Post-launch backlog (unscheduled, in rough order): hidden classes
(community-discovered, D7 note) · sub-vs-sub rivalry ladder (D21, blocked
on cross-install) · ambient audio loops · boss death animations ·
gear-editor tool upgrades for seasonal authoring.

## Operations & edge policies

- **Multi-device**: optimistic-versioned writes ([[DATA_SCHEMA]]); last
  writer wins after replay; an active run on device A is simply abandoned
  if device B banks first (runs are cheap, accounts are sacred)
- **Cold start (tiny subs)**: frontier boss HP floors at 3 delvers
  ([[FORMULAS]]); daily report suppresses rank-shaming below 3 players
  ("the Guild is recruiting!"); game is fully playable solo
- **Cheat response**: verification-by-replay flags impossible runs →
  silently excluded from boards/frontier (shadow), account gameplay
  untouched, no public accusation. Repeat = board ban. Never brick a save
- **Player data**: aggregate-only metrics ([[METRICS]]); account deletion =
  delete `hero:{userId}` on request via mod/menu action
- **Save integrity**: every schema change = version bump + migration test
  BEFORE deploy ([[DATA_SCHEMA]] policy); never deploy a reader that can't
  read yesterday's writes
- **Season rollover**: scheduler closes boards at UTC midnight day 28,
  freezes report, stamps cosmetics, seeds next ladder — all idempotent
  (a re-run must not double-award)

## Related

- `TODO.md` — the build order · [[METRICS]] — the gates · [[DECISIONS]]
- [[LAUNCH]] — the testing ladder + marketing channels each milestone feeds
