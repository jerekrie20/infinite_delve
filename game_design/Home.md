---
tags: [hub]
status: living
---

# Delve — design vault

Home base for the game design. Open the `game_design/` folder as an **Obsidian
vault**. Use quick-search (Ctrl/Cmd-O), the **graph view** to see how systems
connect, and the **backlinks** panel at the bottom of each note.

> Working codename **DELVE** — a co-op roguelike RPG for Reddit. See [[CORE_LOOP]].

## Start here

- [[CORE_LOOP]] — what a player does, at every timescale
- [[ARCHITECTURE]] — Phaser client / TypeScript server split
- [[mechanics-index]] — the mechanics stack (design order + status)
- [[FINALIZE]] — ⭐ open decisions to lock (review these)
- [[BUILD]] — 🔨 the v0 vertical-slice build plan (start here to build)
- [[TOOLS]] — the dev tools and how to run them
- [[MECHANICS_TODO]] — open-questions backlog

## The mechanics stack

[[core-run]] → [[classes]] → [[monsters]] → [[combat]] → [[loot-gear]] →
[[delve-generation]] → [[frontier]] → [[economy]] → [[onboarding]] →
[[reddit-native]]

## Vault conventions

- One folder per mechanic; a primary note named for the mechanic, plus topic
  pages (e.g. [[classes]] + [[advancement]]).
- Frontmatter on every note: `status`, `depends-on`, `tags`.
- Link liberally with `[[wikilinks]]` — they power search, backlinks, and the
  graph. (Same `[[ ]]` idea as the memory system.)
- `status` values: `done` · `in-progress` · `next` · `queued` · `living`.
