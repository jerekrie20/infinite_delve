---
tags: [mechanic, foundation]
status: in-progress
depends-on: []
---

# 00 · The Core Run

The atomic gameplay loop. Side-view idle looter: hero auto-battles monsters
one at a time, descending endless depths. Tension = how much unbanked value
you're carrying vs how deep you dare push. Decisions: D3-D6, D19 in
[[DECISIONS]].

## The run (target design)

```
Open → pick starting checkpoint (depth 1 or any unlocked boss floor)
     → rotation-driven auto-battle descends, floor by floor (D30);
       manual casts interleave anytime; boss floors open a BOSS ROOM
       where your hands matter (D31)
     → every 5th depth (mini-boss/boss floor): pause → Continue or Extract?
     → Extract: bank EVERYTHING gained this run → back to base
     → Die:     lose everything unbanked → death recap card (D35)
     → (flee button works between fights only — never mid-fight, D33)
```

## Checkpoints (D4)

- Felling the boss at depth 10/20/30… **permanently unlocks** that checkpoint
  as a starting point (start at boss depth + 1)
- Player picks any unlocked checkpoint at run start — replaying shallow floors
  is always allowed, never required
- Checkpoints do **not** bank mid-run (D5) — they are start points only

## Banking & death (D5)

- **Extract** = bank the entire run: gear haul, gold, XP
- **Death** = lose all unbanked gains from this run; hero persists, gear
  equipped before the run is safe, previously banked anything is safe
- No XP/gold drip mid-run — the whole run rides on getting out

## The automation ladder (D1, D18, D19)

Automation is progression: bought with gold, gated by play milestones.
The manual game comes first; each tier removes one chore you've mastered.

| Tier | Unlock gate | What it does |
|------|------------|--------------|
| 1. Auto-Continue | first boss kill | auto-pass checkpoint choices down to a configured depth |
| 2. Rotation Conditionals | ~level 20 | author smart rotation rules ("Guard when HP<50%", "hold Ult for bosses") — the base rotation (D30) is free for everyone; this tier makes it clever |
| 3. Auto-Extract | first mastery gate (~L25) | extract automatically at target depth or HP threshold |
| 4. Offline Expeditions | promotion 2 (~L45) | server-simulated real runs while away (policy: start checkpoint + extract-at depth + consumable loadout). Real deaths, real lost hauls (D19) |
| 5. Expedition capacity | repeatable | more offline runs / longer offline window |

Gold prices scale per tier — this is the economy's marquee sink (see
[[economy]]). Pre-automation players keep today's capped idle-gold trickle;
offline expeditions supersede it once unlocked.

## What's built vs target

| Piece | Today | Target |
|-------|-------|--------|
| Choice cadence | after EVERY kill | every 5th depth only (D3) |
| Run start | always depth 1 | player-picked checkpoint (D4) |
| Death | loses whole run | same — confirmed as design (D5) |
| Automation | none (idle gold trickle only) | 5-tier ladder above |
| Offline | gold trickle | real simulated expeditions (D19) |

## Design principles

- **Auto-battle, not action** — reflex-light, deterministic, server-verifiable
- **Player agency** = build + ability timing + push/extract judgment +
  checkpoint/policy strategy
- **Banked is sacred; unbanked is the stake**
- **Resource attrition** — HP/mana are per-run resources; no free full heals
  mid-run (heal-on-kill + abilities + consumables only)

## Feeds

- [[combat]] — damage, hooks, statuses · [[classes]] — kits
- [[monsters]] — the depth map · [[loot-gear]] — the stakes
- [[economy]] — automation prices · [[delve-generation]] — Daily Delve
