---
tags: [hub]
status: living
---

# Delve — design vault

> 🧬 **[[DELVE-SYSTEMS.canvas|Systems map]]** — how the mechanics actually
> WORK and feed each other (the run, combat tick, power stack, loot
> pipeline, economy, mastery loop, community war, automation ladder).
> 🗺️ **[[DELVE-MAP.canvas|Doc atlas]]** — every doc on one board + the
> build order.

Side-view idle looter for Reddit. Phaser client + TypeScript server (Devvit).
Built and running in a Reddit post. This vault tracks what IS, what's planned,
and what was decided.

> **Current state (2026-07-21):** core auto-battle loop functional, monster
> system with passive pools, 2 active abilities per hero, Continue/Extract
> choice after every kill. One class (Squire). See [[ARCHITECTURE]].
>
> **Design fully planned (2026-07-21):** the game is now decided end-to-end
> in [[DECISIONS]] — hybrid idle (automation-as-progression), checkpoint
> runs, class-mastery prestige via evolution chains, frontier boss ladder,
> strict cosmetics-only monetization. If any doc disagrees, DECISIONS wins.

## Start here

- [[DECISIONS]] — the locked design record (source of truth)
- [[CORE_LOOP]] — what a player does, every timescale
- [[ARCHITECTURE]] — Phaser client / TypeScript server / shared content
- [[mechanics-index]] — the mechanics stack with build status + build order
- [[MIGRATION]] — what changed from the old GameMaker-era design

## Source-of-truth companions (added 2026-07-21)

- [[FORMULAS]] — every curve and rate (normative on numbers)
- [[DATA_SCHEMA]] — save shapes, Redis keys, migration policy (normative)
- [[WORLD]] — tone, fiction (Torchrest/the Delve/Terrors), naming rules
- [[METRICS]] — what "fun is proven" means in numbers; the milestone gates
- [[RELEASE_PLAN]] — milestones, seasonal content cadence, ops policies
- [[TOOLING]] — the tools that make content cheap · [[PLAYBOOK]] — steps
  for adding anything · [[SECURITY_PERF]] — threat model + budgets
- [[LAUNCH]] — playtesting ladder + marketing playbook (pre-live)
- [[LORE]] — ⚠️ the mystery spine + every fragment (spoilers for players!)
- `../CODING_BIBLE.md` — engineering law + project structure (the code-side
  counterpart to this vault; agents read it via `../AGENTS.md`)
- `art/` — [[ART_BIBLE]] (style canon) · [[asset-manifest]] (every asset,
  counted + phased) · [[audio]] (SFX pack)

## The mechanics stack

[[core-run]] → [[classes]] → [[monsters]] → [[combat]] → [[loot-gear]] →
[[delve-generation]] → [[frontier]] → [[economy]] → [[onboarding]] →
[[reddit-native]]

## Vault conventions

- One folder per mechanic; primary note + topic pages
- `status`: `built` · `in-progress` · `planned` · `queued` · `living`
- `depends-on`: what must be stable before this is designed
- Link with `[[wikilinks]]` for search + backlinks + graph

## Related

- `../GAME_BLUEPRINT.md` — the WHY (motivation stack, personas, drama engine)
- `../game_design_old/` — previous GameMaker-era design (pre-Phaser pivot)
- `../tools/README.md` — dev tools reference
