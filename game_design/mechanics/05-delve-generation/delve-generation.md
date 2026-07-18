---
tags: [mechanic]
status: planned
depends-on: [core-run, combat]
---

# 05 · Delve Generation

Produces the space a run happens in. Reuses the Faction War map generator (see
[[TOOLS]]).

## Flow

```mermaid
graph LR
  SEED[Seed: personal run · or the shared Daily] --> BIO[Pick open biome + depth]
  BIO --> GEN[Generate delve: fog map]
  GEN --> POP[Populate: monsters · chests · temple?]
  POP --> RUN[Descend deeper → extract when you dare]
```

## Decided ✅
- **Two run types:**
  - **Personal delves** — random/personal seed, endless, **repeatable** (the
    daily grind; feeds your hero + the [[frontier]]).
  - **The Daily Delve** — **one shared seed** (same map for everyone that day),
    **one attempt**, ranked on a **leaderboard** — the communal, Wordle-style
    event (drives daily engagement + comments). See [[reddit-native]].
- **Solo, instanced** (v1) — no co-op yet.
- **Depth = pushed in-run** (see endless below) — no pre-entry difficulty dial.

## Endless vs fixed — RECOMMEND endless (you wanted it; here's how)

Endless is standard for this genre and simple with what we've already decided:
the generator just keeps making **deeper floors/regions on demand**, [[monsters]]
already **scale by depth**, and [[core-run]]'s **extract-or-die** is what makes
it work — there's no "end," *you* choose when to bank. Push as deep as you dare
for better loot; one bad fight and you lose the unbanked haul. This also
auto-answers "how is depth chosen": it's just **how far you push.**
→ Proposed: **switch #14 to endless.** (Fixed-length stays the fallback if you'd
rather cap runs.)

## Proposed (still open)
- Biome drawn from the biomes the [[frontier]] has opened; deeper = harsher.
- Objectives: push for loot + reach an extract; optional vault / mini-boss.
- **Class temples** appear when you're eligible to promote (the [[advancement]]
  trial). Fog revealed as you move.

## ❓ To finalize
- **Confirm endless** (recommended) vs fixed-length.
- Extract points — anywhere, or only at set stairs/exits?

## Related
[[core-run]] · [[combat]] · [[monsters]] · [[frontier]] · [[advancement]]
