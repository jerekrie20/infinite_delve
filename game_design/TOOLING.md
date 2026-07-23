---
tags: [tooling]
status: living
---

# Tooling Plan — what makes content cheap to add

The seasonal cadence ([[RELEASE_PLAN]]) only works if adding content is
data entry, not engineering. Existing tools + what to build/extend, in
priority order. Convention stands: **tools emit DATA; the registry/engine
stays hand-written** (the data/logic boundary from gear-v2).

## Exists (tools/)

- **Combat sim** (HTML + CLI) — needs the v2 rewrite below
- **Gear editor** (4 tabs: bases/sets/uniques/stat-catalog) — extend
- **UI map editor · atlas picker · HUD preview** — fine as-is
- **`?debug=1`** in-game combat log — keep current with every new hook

## Build / extend (priority order, tied to TODO phases)

1. **Balance sandbox** (Phase 2 gate): TUNING sliders + live sim readout —
   wall depth per build archetype ([[build-theory]]), TTK curves, economy
   solvency check ([[FORMULAS]]), extract-rate simulation. THE tuning tool;
   everything ⚙ in the vault gets validated here
2. **Sim CLI v2** (with Phase 1): headless seeded runs of combat v2
   (rotation, packs, statuses, boss signatures) — same shared code the
   server sim uses; snapshot tests ride on it
3. **Content editor upgrades** (Phase 3+): gear editor grows tabs for
   **abilities** (the D24 grid), **monsters/bosses** (templates +
   signatures + affinities), **statuses**, **events**. Each emits TS blocks
   to paste, exactly like today
4. **Sprite pipeline scripts** (first art phase): bbox→origin extractor
   (exists as scratch script — promote it), atlas packer for the gear
   sheet, anchor-table authoring helper (click hand/head/hip per frame →
   emits the table [[ART_BIBLE]] §5 needs)
5. **Season kit checklist runner** (post-launch): validates a season packet
   (new set + uniques + branch kit + modifier) against [[PLAYBOOK]] rules —
   no orphan stats, affinities set, icons present

## Rule

A content type earns a tool the SECOND time it's authored by hand. First
time by hand teaches the shape; third time by hand is a process failure.

## Related

- [[PLAYBOOK]] — the checklists tools automate · `tools/README.md`
- [[RELEASE_PLAN]] — the cadence this serves
