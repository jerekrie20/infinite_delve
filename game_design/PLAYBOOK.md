---
tags: [process]
status: living
---

# Content Playbook — steps for adding anything

The repeatable checklists. Every step names the file/doc/tool it touches.
Rule zero: **vault first** — if the addition isn't representable in the
catalogs, extend the catalog docs BEFORE writing code ([[DECISIONS]] flow).

## Add an ability (one row of the D24 grid)

1. Design row in [[class-kits]] (slot, option #, numbers, status refs, Auto hint, targeting)
2. Cross-check: effects map to [[status-effects]] / [[stats-catalog]] entries
3. `actives.ts` row (+ handler only if a NEW effect mechanic)
4. Icon (24px, [[ART_BIBLE]]) → atlas; SFX mapping if new family
5. Sim: rotation including it clears at-level; guardrails in class-kits hold

## Add a status

1. Row in [[status-effects]] (kind, magnitude, duration, stack rule, sources, counterplay, element tag)
2. VFX identity in [[ART_BIBLE]] §6 + icon
3. Engine: preset of StatMod/DoT machinery (never a bespoke system)
4. Give it ≥1 source AND ≥1 archetype that wants it ([[build-theory]] map)

## Add a monster / boss

0. Bestiary lore line (≤25 words, [[LORE]] caps + truth-consistency)
1. Row in [[roster]] (kind/role, baseStats, statMult, pool, depth band; boss: signature cooldown + action)
2. Affinity + composition rules checked; passive pool exists in [[stats-catalog]] matrix
3. `monsters.ts` row (+ pool row in `passives.ts` if new theme)
4. Sprite per [[ART_BIBLE]] (+ manifest ledger entry + origin), anims per matrix
5. Sim: TTK at its depth band within tolerance

## Add a gear base / set / unique

0. Sets/uniques: flavor line (≤20 words, [[LORE]] caps + truth-consistency)
1. Row in [[gear-catalog]] (slot family, primary, pool — pool stats must exist)
2. `items.ts` / `sets.ts` / `uniques.ts` via the gear editor
3. Paper-doll layers (family × 3 tiers, or bespoke for set/unique) + manifest
4. [[build-theory]]: which archetype chases it? (none = redesign)

## Add a depth theme (the season big-ticket)

[[roster]] band (3 templates + boss + support) → affinity row → palette row
([[ART_BIBLE]] §3) → backdrop + boss room + decor → set + 2 uniques
([[gear-catalog]]) → [[WORLD]] names + [[LORE]] fragments (theme line,
bestiary lines, flavor, 2-3 new encounters) → manifest entries → sim the band.

## Add a NEW MECHANIC (anything with rules, not just data)

1. Interview/decide → new D# in [[DECISIONS]] (nothing builds without a D#)
2. Which mechanic doc owns it? Extend it (or add `mechanics/NN-name/`)
3. Numbers → [[FORMULAS]] · persisted state → [[DATA_SCHEMA]] (version bump
   + migration) · art → [[ART_BIBLE]] section + manifest · words → [[WORLD]]
4. TODO.md placement + [[METRICS]] gate if it's a loop change
5. Only THEN: code

## Definition of done (any content)

Vault row exists · data file row exists · no orphans (stat↔consumer,
status↔source) · art accepted per checklist + manifest ledger updated ·
sim/test passes · short-form numbers format correctly.

## Related

- [[TOOLING]] — automating these · [[DECISIONS]] · all catalogs
