---
tags: [mechanic]
status: planned
depends-on: [classes, combat, loot-gear]
---

# 10 · Hero Progression

XP, levels, gates, mastery pacing. The class-chain structure lives in
[[classes]]; this doc owns the numbers and the unlock schedule.
Decisions: D9-D11 in [[DECISIONS]].

## The level structure (per branch-run)

```
L1 ──── L25 gate ──── L45 gate ──── L70 capstone = MASTERY
 base     promote       promote        chain complete
 class    (stage 2)     (stage 3)
```

- One continuous XP bar; **must promote at gates to keep leveling** (D9)
- Cap ~70 per chain (was 100 — rescoped to hit D11 pacing)
- XP from kills, scaled by depth, banked on extract (D5)

## Unlock schedule (per chain — tune in sandbox)

| Level | Unlock |
|-------|--------|
| 1 | ability 1 + class passive slot 1 |
| 5 | ability 2 |
| 12 | ability 3 · passive slot 2 |
| 25 | **promotion** → stage-2 kit ability 4 · automation tier 3 purchasable |
| 35 | passive slot 3 |
| 45 | **promotion** → stage-3 kit ability 5 · automation tier 4 purchasable |
| 60 | passive slot 4 |
| 70 | **capstone → mastery** (D10 grants) |

- Player passive pools exist in `passives.ts` but are NOT yet applied to
  heroes — passive slots are the wiring milestone
- Inherited-ability slot ([[classes]] D10) is account-level, not per-chain

## Pacing target (D11)

- First mastery: **~3-4 weeks engaged daily play** (~1 season)
- Second chain: noticeably faster (account bonus + level-gated twink gear +
  deep checkpoints + automation already owned)
- XP curve derived from this target in the balance sandbox, not guessed

## Account-wide layer (persists across everything)

- Mastery bonuses (+2-3%/mastery, D10) · unlocked checkpoints (D4) ·
  automation tiers (D18) · gold/stash · cosmetics/titles · saved mastered
  classes (D8)

## Post-capstone (D34)

No XP past L70. A mastered class progresses through gear (crafting the
perfect kit), deep-push records, dailies, and frontier damage — the level
treadmill deliberately ends; that's the nudge toward the next chain.
Class switching between the in-progress climb and mastered saves is free
at base, anytime (D34).

## The Codex (D45)

Trophy Hall's completion log — the parallel progression track that never
walls:

- **Bestiary**: kills per template; entry art unlocks at first kill,
  lore line at 100 kills ⚙
- **Collection**: every base/set/unique — found items rendered, unfound as
  silhouettes (the visible chase; pairs with D46 pity bars)
- **Deeds**: milestone achievements (depth firsts, kill counts, trial
  feats, event outcomes) → flair/title/decoration rewards (D2-safe);
  secret deeds (D37) appear only once earned
- **Guild completion %** — the sub's collective codex number, shown at the
  Guildhall and in ledger posts

Data cost: counters keyed by content ids ([[DATA_SCHEMA]] — a `codex`
counters map); content derives from the catalogs, so new content auto-adds
codex entries ([[PLAYBOOK]] deed step).

## Death & levels

Death never costs levels or banked XP — only the current run's unbanked
gains (D5).

## Related

- [[classes]] — chains/kits · [[core-run]] — automation gates
- [[DECISIONS]] D9-D11
