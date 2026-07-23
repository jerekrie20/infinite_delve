# Delve — Coding Bible

Engineering law for this repo, for humans and AI agents alike. The design
counterpart is `game_design/` (DECISIONS.md D1-D49 is the design source of
truth). If code and vault disagree, the vault wins — fix the code or, if
the vault is wrong, change the vault FIRST, then the code.

**Agent read order:** `game_design/DECISIONS.md` → `game_design/PLAYBOOK.md`
(when adding content) → this file → the file headers of whatever you touch.

---

## 1. Architecture principles (non-negotiable)

1. **Server owns value, client owns feel.** Anything that changes gold, XP,
   items, masteries, boards, or frontier state is computed or validated
   server-side. The client renders, predicts, and requests.
2. **The shared layer is pure.** `src/shared/` imports nothing from client
   or server, does no I/O, touches no globals. Both sides import IT.
3. **Determinism is law.** All combat/loot/spawn randomness flows through
   an injected `Rng` (`() => number`). `Math.random` in `src/shared/` is a
   bug (the sanitize fallback id is the one grandfathered exception —
   remove it when touched). Same seed = bit-identical run: Daily Delve
   fairness, offline sim, and replay verification all depend on this.
4. **One combat engine.** Phase 1 extracts the combat loop OUT of
   `LaneScene` into `src/shared/combat/`. LaneScene becomes a *renderer*
   of engine events; the server sim and tools run the same engine.
   Never re-implement a combat rule client-side or server-side.
5. **Data-driven registries.** Content is rows (stats, handlers-by-name,
   monsters, actives, sets, uniques, bases, pools). Adding content that
   reuses existing ops/hooks = data only. A new MECHANIC = one hook/handler
   in code, then rows forever. Tools author data; engine code is
   hand-written (`game_design/TOOLING.md`).
6. **Lean saves.** Persisted shapes use short keys where volume matters
   (`GearItem.r/.s`), store nothing derivable (names, derived stats), and
   follow `game_design/DATA_SCHEMA.md` — which is normative. Any stored
   shape change = `v` bump + explicit migration + a migration test.
7. **Numbers live in TUNING / FORMULAS.** No gameplay constant is hardcoded
   at a use site. New knob → `TUNING` (via `game_design/FORMULAS.md` if
   it's a curve/rate). ⚙-marked values are sandbox-tunable; change them in
   FORMULAS first, then mirror in `tuning.ts`.

## 2. Project structure

```
infinite-delve/
├── game_design/          # THE VAULT — design source of truth (D1-D49)
├── CODING_BIBLE.md       # this file
├── AGENTS.md             # short agent brief → points here
├── TODO.md               # build roadmap (phases, gates in METRICS.md)
├── devvit.json           # Devvit config: entrypoints, menu/scheduler endpoint mappings
├── src/
│   ├── shared/           # PURE. Types, math, content. No I/O, no env.
│   │   ├── delve.ts      #   contracts/types (map-era types leave in Phase 0)
│   │   ├── waves.ts      #   spawn + reward math (EV rewards after Phase 0)
│   │   ├── daily.ts / report.ts / api.ts
│   │   ├── combat/       #   [Phase 1] engine v2 — THE one combat loop
│   │   │   ├── clock.ts      # 100ms tick, per-entity attack timers
│   │   │   ├── statuses.ts   # Status runtime + 16 presets (StatMod generic)
│   │   │   ├── rotation.ts   # priority selection, manual queue, conditionals
│   │   │   └── engine.ts     # runFloor/runRun → emits events; render-agnostic
│   │   ├── sim/          #   [Phase 1/6] headless run simulator (tests, tools, server)
│   │   └── content/      #   data registries + derive logic
│   │       ├── stats.ts / handlers.ts / passives.ts / tuning.ts
│   │       ├── items.ts / sets.ts / uniques.ts / gear.ts
│   │       └── classes.ts / actives.ts / monsters.ts
│   ├── server/           # Devvit serverless. Owns Redis + all value.
│   │   ├── index.ts      #   Hono app: /api/* public, /internal/* devvit hooks
│   │   ├── core/         #   hero.ts (→account), frontier.ts, rng.ts, post.ts
│   │   └── routes/       #   one file per surface: game, daily, scheduler…
│   └── client/           # Phaser + DOM panels, inside Reddit's iframe
│       ├── main.ts       #   bootstrap + event wiring
│       ├── api.ts        #   fetch wrappers; null on failure → local fallback
│       ├── game/         #   Scenes (LaneScene renders the engine, HudScene)
│       ├── ui/           #   DOM overlay panels (gear, daily…)
│       └── public/       #   sprites, atlases, ui-map.json
├── tests/                # [Phase 0] tsx-run asserts, one file per shared module
└── tools/                # dev tools (vite.tools.mjs, :5179) + tsconfigs
```

Placement rules: game math → `shared` · anything reading `redis`/`reddit`/
`context` → `server` · anything touching DOM/Phaser → `client` · a file
needing two of those layers is two files.

## 3. Code style

- **Descriptive full-word names.** `monsterAttackTimer`, not `mAtkT`.
  The owner reads and retypes code by hand; clarity beats brevity always.
- **File-header comments are mandatory** and follow the house pattern: a
  short block at the top saying what the module IS, who imports it, and
  the one thing you must not break (read any file in `shared/content/` for
  the register). Inline comments state constraints the code can't
  ("caps derived TOTAL, not the roll"), never narrate the obvious.
- **Named exports only. No default exports. No type casts** (`as` is a
  code smell; the sanitize boundary is the deliberate exception — it casts
  AFTER validating). Interfaces for object shapes, type aliases for
  unions/functions — match the file you're in.
- Formatting is Prettier's problem (`npm run prettier`); don't hand-align.
- Errors: routes catch, log with route name, return `{ error }` + status —
  copy the existing pattern in `routes/game.ts`. Never let a meta
  side-write break a core write (see the try/catch around `recordRun`).

## 4. Validation workflow — NO BUILDS IN DEV

Standing owner rule: **never run `npm run build` / `vite build` / `devvit
upload|playtest` unprompted.** Validate with:

```
npm run type-check      # tsc --build, all four tsconfigs
npm run lint            # eslint (floating-promises is an error — await or void)
npx tsx tests/<file>    # logic verification (Phase 0 adds the harness)
npx tsx tools/combat-sim.ts 12 10 8 60   # quick combat behavior check
npx vite --config vite.tools.mjs         # tools server :5179 (sim, editors) — on request
```

Tests are plain tsx scripts with `assert` — no framework. One file per
shared module, fixtures for migrations, seeded-Rng determinism checks
(same seed twice → identical output) on the engine. Every Phase-0+ bugfix
lands with the assert that would have caught it.

## 5. Server rules

- Never trust the client: value comes from server recomputation (EV reward
  math) or sanitize-and-clamp (`sanitizeGearItem` is the reference
  pattern: validate structure, clamp vs authoritative budgets, RECOMPUTE
  derivable fields, never echo claims).
- Identity = `context.userId` only. Never a client-supplied id.
- **Every new endpoint ships WITH its rate limit + input size caps**
  (`game_design/SECURITY_PERF.md` table) and a `devvit.json` mapping if
  it's a menu/scheduler/trigger endpoint.
- Redis access lives in `server/core/*` modules, not in routes. Account
  writes go through `updateHero` (heroStore.ts) — WATCH/MULTI/EXEC
  compare-and-set with mutation replay on conflict (DATA_SCHEMA). Mutators
  passed to it must be pure functions of the hero they receive (they may
  re-run).
- Scheduler jobs must be idempotent — a re-run may never double-award.

## 6. Client rules

- Devvit iframe constraints: `navigateTo` from `@devvit/web/client` (never
  `window.location`), `showToast`/`showForm` (never `alert`), no inline
  `<script>` in HTML files. `@devvit/public-api` / "blocks" code is
  forbidden (web-only project).
- `api.ts` wrappers return `null` on failure; callers fall back to local
  preview state — keep that contract, and (Phase 0) queue+retry run
  results instead of silently dropping them.
- The splash entrypoint stays featherweight (it renders inline in feeds —
  D48 live preview). Heavy deps belong to the game entrypoint only.
- Scenes render; they do not decide. Combat truth lives in the shared
  engine (rule 1.4). HUD updates flow through the existing event names
  (`hud-changed`, `hero-changed`, `run-resolved`, `run-reset`).
- Respect perf budgets (`SECURITY_PERF.md`): pooled float-text, DoT ticks
  merged to 1s sums, themes lazy-loaded, ≤4 HP bars.

## 7. Git & process

- Small, single-topic commits; message = `area: what changed` (e.g.
  `combat: per-entity attack timers`). Commit/push only when the owner
  asks.
- A change is DONE when: type-check + lint + relevant tsx tests pass, the
  vault row it implements exists (PLAYBOOK definition-of-done), and
  TODO.md's checkbox is updated in the same change.
- Schema changes additionally need: DATA_SCHEMA updated, `v` bump,
  migration + fixture test.

## 8. AI-agent contract

1. **Never invent design.** Behavior questions → DECISIONS/catalogs. If
   the vault is silent, ASK the owner (or propose a D# addition) — don't
   improvise a mechanic into code.
2. **Vault first** on any addition (PLAYBOOK rule zero), TODO checkbox
   with the work, FORMULAS before changing any ⚙ number.
3. **No builds, no deploys, no `devvit` CLI** unless explicitly asked.
   Validation = §4.
4. Don't touch `game_design_old/` (archive) or resurrect map-era code
   (delvegen/noise/DelveMap — Phase 0 deletes them).
5. Art generation follows `game_design/art/ART_BIBLE.md` verbatim-recipe +
   acceptance checklist; record IDs/origins in the asset-manifest ledger.
6. When something you verify contradicts the vault or a memory, surface
   it — stale docs are bugs too.
