---
tags: [overview]
status: living
---

# Mechanics — deep-dive scaffold (Thu/Fri 2026-07-09/10)

**Related:** [[mechanics-index]] · [[Home]]

*NOT answered yet — on purpose. This is the spine for the deep session. We fill
it in together until it's a real spec, THEN code. Each question, when answered,
should pass the blueprint's kill-test (motivation row + persona + loop +
anecdote — see ../factionwar2000/GAME_BLUEPRINT.md).*

## A. Combat
- Turn-based, or light real-time? (Pins client complexity + feel.)
- What's a "turn"? (move + action? action points? energy?)
- Damage model — deterministic, or dice/variance? crits?
- Enemy variety & behavior — Tiny Swords roster + what each does.
- How does death resolve mid-delve — instant, or downed/rescue?

## B. Hero & progression
- Stats — what few numbers define a hero? (HP, attack, defense, speed…?)
- Levels & XP curve — how fast, how deep?
- Abilities — active/passive? how acquired (loot, level, skill tree)?
- Classes/archetypes, or one flexible hero?
- Prestige / soft-reset across seasons — what persists vs resets?

## C. Loot & gear
- Slots (weapon/armor/trinket…?) and rarity tiers.
- Where gear comes from (drops, chests, shop, crafting?).
- Extract-or-lose stakes — what exactly is lost on death?
- Inventory limits / stash / banking rules.

## D. The delve (generated content)
- Size, shape, length of one delve — how long is a run?
- Fog & reveal rules.
- Objectives per delve (loot? boss? extract point? depth?).
- Daily modifiers / mutators (what makes today's delve *today's*).
- Difficulty scaling with hero level (and keeping it fair).

## E. The frontier (shared community layer)
- What IS the shared objective? (explore % / boss HP / reach a region?)
- How does a solo run contribute to it (which results roll up)?
- What does the community *see* and celebrate?
- Season length + win/lose conditions + end ceremony.
- Sharding rule for huge subs.

## F. Economy & monetization
- Run budget / energy — how many delves/day, refresh rule.
- Currency(ies)?
- Cosmetics-only monetization (blueprint rule: no pay-for-power) — what sells?
- Supply-drop / generosity-as-status idea — does it fit here?

## G. Onboarding (blueprint's #1 gap)
- First 30 seconds — how does a brand-new player feel identity + take one
  useful action immediately?
- The "Conscript" path — one-tap useful action with zero RPG literacy.
- Tutorial vs learn-by-doing.

## H. Reddit-native layer
- Frontier report — what's in the daily post?
- Milestone/event posts.
- What lives in comments (coordination, bragging, builds).
- Devvit push constraints (no arbitrary notifications — feed surfaces only).

## Cross-cutting checks (apply to every answer above)
- Does the Conscript (casual lurker) survive it, or does it only serve the
  General (hardcore)?
- What anecdote does it generate? ("Players will tell each other that…")
- Does it keep the client sane (no accidental physics-engine scope)?
- Does it keep the server authoritative where it must be (anti-cheat)?
