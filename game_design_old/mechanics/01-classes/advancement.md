---
tags: [mechanic]
status: done
depends-on: [classes]
---

# Classes — advancement, roster & respec

*Decisions locked 2026-07-10. Overview: [[classes]]. Hub: [[Home]].*

**Related:** [[classes]] · [[loot-gear]] · [[delve-generation]] · [[combat]] · [[monsters]]

## The promotion ritual

```mermaid
graph LR
  LV[Reach level gate] --> IT[Find hinted items]
  IT --> KEY[Craft the key]
  KEY --> TMP[Class temple]
  TMP --> BOSS[Beat the trial boss]
  BOSS --> PRO[Promote]
  PRO -->|capstone maxed| ROS[Mastered → roster]
```

## Roster payoff — ✅ B + D

When you Master a path (max a capstone), the roster entry gives you:
- **(B) Prestige badge / status** — a trophy on your profile; bragging rights.
- **(D) A new base pick** — that class becomes selectable when you begin a new
  hero.

So the roster is *both* a wall of trophies *and* a growing menu of ways to
start — **without** letting anyone skip the journey (rejected option A).

**Amendment (2026-07-14):** mastering a path now ALSO grants a **small earned
stat bonus** (~1% HP/Attack/etc per mastery — see [[hero-progression]]). It's
earned, not bought, so still not pay-to-win — but it means veterans get
permanently stronger, so **watch Daily-leaderboard fairness** (may need a cap or
bracketing).

## Advancement trigger — ✅ a promotion RITUAL (not just a level-up)

To advance up a tier you must:
1. **Reach a level threshold** (the gate).
2. **Find the advancement item(s)** — scattered in the world with **hints**
   throughout (discovery + community sharing).
3. **Craft the key** from the found items.
4. Take the key to the **class temple** and insert it.
5. **Beat the trial** — fight the temple's monsters + a **boss**.
→ Promotion granted.

This makes every promotion an *event* — a mini-questline the community
theorycrafts and races (where are the items? how do you craft the key? how do
you beat the trial boss?).

**Pacing — ✅ decided:** EVERY named promotion requires the full ritual (no
level-only steps); the ritual scales in difficulty with tier. Every promotion is
an event. (Tune the item-hunt length so it doesn't bottleneck.)

## Hero permanence — ✅ permanent

A hero is **permanent across seasons** — its journey climbs the tree over
months. The **frontier** (shared map) resets each season; the **hero does not**.
(This is why commitment stakes are real → hence the respec rules below.)

## Commitment softener — ✅ respec rules

- **One free respec per hero.**
- After that, a **rare item** grants a respec that **steps back one node** on
  the branch.
- **Starting a new journey is always free** — begin a new hero as any base
  class or any roster-unlocked Mastered class (roster payoff D). So a "wrong"
  branch is never account-permanent; it's just this hero's commitment.

## Cross-folder seeds (this ritual spawns work elsewhere — don't lose these)

The advancement ritual invents systems that belong to other folders. Parked
here so we design them in the right place:
- **Advancement items + world hints** → [[loot-gear]] (a quest/key-fragment
  item category with discoverable hints).
- **Crafting (craft the key)** → NEW sub-system — likely a page in [[loot-gear]]
  (or its own folder if crafting grows).
- **Class temple** (a fixed special site) → [[delve-generation]] / the world
  layer.
- **Trial boss** → [[monsters]] + [[combat]] (boss encounters) +
  [[delve-generation]].
