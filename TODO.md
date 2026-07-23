# Delve — Build Roadmap

Checked = done. Unchecked = planned, in priority order.
Read top-to-bottom: each phase builds on the one above it.

**Source of truth:** `game_design/DECISIONS.md` (D1-D49). This roadmap is the
build order from `game_design/mechanics/mechanics-index.md` plus the
2026-07-21 architecture-audit fixes. If a task here conflicts with a
decision there, DECISIONS wins. Advance between phases only through the
gates in `game_design/METRICS.md`; when adding content, follow
`game_design/PLAYBOOK.md` (vault first, then code).

---

## ✅ Done (pre-plan foundation)

- [x] Side-view lane: auto-battle, Continue/Extract, run animations, death/reset
- [x] Monster system: 8 templates, 4 depth themes, passive pools, rarity tiers
- [x] Stat registry (41 stats) + 29 handlers + 7 hook points, symmetric dispatch
- [x] Gear v2: 10 slots, 5 rarities, affix pools, sets, uniques, lean save keys
- [x] Active abilities v1: Slam + Fortify, mana, cooldowns (2/5 slots)
- [x] Hero persistence: Redis, deriveStats, banking, idle gold trickle
- [x] Meta scaffolding (parked): daily seed, per-sub board, frontier aggregate, scheduler
- [x] Tools: combat sim (HTML+CLI), gear editor, UI map tools, `?debug=1` log
- [x] Fresh-hero HP fix — REAL root cause found by the Phase 0 test harness:
      staged behavioral stats (blockHeal/shieldLeech/startingShield) with
      `target: 'maxHp'` poisoned TARGET_MAX, capping every hero's maxHp at 15.
      Fixed (self-targeting-only cap rule) + regression assert in tests/
- [x] increasedCritPct fix (found by the harness) — pure-pct target folded to 0,
      so "% increased crit" gear never applied; special-cased in deriveStats

---

## 🔴 Phase 0 — Foundation fixes (audit findings; small, do first)

Correctness/exploit issues that corrupt balance data and player trust while
they live. All are contained changes.

- [x] **Deterministic reward math** — `runReward()` + `idleGoldPerSecond()`
      now use `rewardEV()` (elite chance × mult folded analytically, mean
      template statMult; boss floors exact). `eliteChanceAtDepth()` is the one
      curve for spawns AND EV; cap moved to TUNING `eliteChanceCap` ⚙
- [x] **Depth plausibility clamp + rate limit** on `/api/run/result` — depth
      clamped by `maxPlausibleDepth` (level + gear + elapsed-time bounds, ⚙ in
      TUNING.plausibility / FORMULAS); rate limits per SECURITY_PERF (1/30s
      run, 5/s equip+sell) via new `core/rateLimit.ts`; run idempotency via
      client `runId` + `core/runDedupe.ts` (dedupe checked BEFORE the limiter);
      clamped depth also feeds the daily board/frontier
- [x] **Save schema versioning** — `v` field + explicit migration table in new
      pure `core/heroSchema.ts` (v1 implicit → v2 current; key-sniffing now
      lives ONLY inside `migrateV1toV2`); DATA_SCHEMA version ledger added
      (target StoredAccount renumbered v3); fixture tests
- [x] **Extract retry** — failed `/api/run/result` (network/429/5xx) now queues
      in localStorage (`client/runQueue.ts`, cap 20, 24h horizon < 48h server
      dedupe TTL) and re-posts with the same `runId` at next boot ("Recovered N
      unsynced runs" toast); banner says "run saved — will sync". Death depths
      queue too, so fast honest deaths still reach the daily board
- [x] **Redis lost-update guard** — all 4 game endpoints now go through
      `updateHero` (new `core/heroStore.ts`): WATCH/MULTI/EXEC compare-and-set,
      conflict → fresh read + mutation replay (budgets run-result>hero>equip>
      sell), exhausted → 409. hero.ts is now fully pure (no redis import)
- [x] **Dead code sweep** — deleted map-era code (`delvegen.ts`, `noise.ts`,
      `DelveMap`/`Terrain` types + map contracts), legacy `/api/init|state|score`
      demo routes (+ `shared/api.ts`), demo form (`forms.ts` + devvit.json
      mapping + broken menu item), hidden HTML HUD (`ui/hud.ts` + `#hud` DOM;
      `formatShort`→`ui/format.ts`, `HudSnapshot`→HudScene). Moved
      `core/rng.ts`→`shared/rng.ts` (canonical seeded `Rng`)
- [x] **Docs hygiene** — marked `GAME_BLUEPRINT.md` superseded (points to
      `game_design/`); it describes the old Faction War concept
- [x] **Test harness** — tsx-run test file over shared math (`deriveStats`,
      `rollGear`/`sanitizeGearItem`, `runReward`, `frontier` with fake Redis).
      The shared layer was built for this; balance work needs the safety net.
      Built: `tests/` (helpers + fake Redis + 4 suites), `npm run test`,
      tests tsconfig + eslint block. Immediately caught the maxHp-15 and
      increasedCritPct-dead bugs above

## 🟠 Phase 1 — Combat framework v2 (D14, D30-D32) — unblocks nearly everything

Built 2026-07-22: the loop extracted into `src/shared/combat/` (clock /
statuses / rotation / engine — bible §1.4: ONE engine; LaneScene is now a
renderer of `CombatEvent`s; sim + tests run the same code).

- [x] **Per-entity attack timers on a 100ms clock** — global 2s exchange tick
      dead; interval is a class stat (`ClassDef.attackIntervalMs`) / per-kind
      monster content (`KIND_INTERVAL_MS`, roster.md ⚙); `attackSpeedPct`
      live (cap +50, floor 1.0s); damage variance → ±5% (D35). Fixed-step
      `StepAccumulator` quantizes frame deltas — replay is frame-rate-proof
- [x] **Rotation system** (D30) — slot 1 = basic attack (Slam rebalanced to
      the class-kits 115% no-mana style); slots 2-5 by player-ordered
      priority (skip-if-unaffordable → basic); manual taps queue to the beat
      (D33) and win; priority badges + ▲-promote editor in the HUD skills
      tab; order persists client-local (`delve:rotation:v1` — DATA_SCHEMA)
- [x] **Packs** (D32) — `packForDepth`: 1-3 enemies by kind rules (roster ⚙),
      front/back rows, `Targeting` on abilities (front/all/back/random),
      floor-budget split ×(1+0.15(n−1)) ⚙; `rewardEV` folds the pack EV
      analytically so server payouts still match client spawns
- [x] **Status-effect framework** — all 16 statuses as preset rows over
      generic machinery (DoT tick · signed StatMod read-at-use · Shield pool
      · stun gate) incl. element tags (D38), resist model, boss stun
      halving, 8-cap, cleanse rules; 1s tick; HUD emoji icon row (real 24px
      icons ride the art phase-1/2 pass)
- [x] Hard-coded Fortify check replaced — Fortify is status row #11;
      `ActiveBuff`/`ACTIVE_HANDLERS` deleted
- [x] **Sim CLI v2** (TOOLING #2) — `shared/sim/runSim.ts` (headless seeded
      policy runs on THE engine) + `tools/combat-sim.ts` thin CLI; the v1
      duplicated loop is dead
- [x] **Seeded combat end-to-end** — engine seeds from `seedFromString(runId)`
      (replay-ready for Phase 7); damage/drops/spawns all draw the run rng;
      `Math.random` defaults REMOVED from waves/items (rng now required);
      client keeps live-random only for cosmetics + id fallbacks
- [x] Cleanup: `dispatchHook` → pure `collectHook` (engine applies results
      centrally); revive moved to a new `onLethal` hook — the probe can no
      longer re-fire dodge/block/thorns
- [x] Staged stats flipped live: poison duo, cleave (true adjacent-hit),
      statusResist, shield pair (startingShield/shieldLeech), preemptive;
      NEW burn/bleed/slow/shock appliers + `attackSpeedPct` (stats-catalog
      Part B; registry now 46 stats). Tests: 102 asserts incl. the
      same-seed-twice determinism law

## 🟡 Phase 2 — Run restructure + world (D3-D6)

- [ ] **Checkpoints** — felling boss at depth 10/20/30… unlocks it; run-start
      checkpoint picker UI (after-death flow too)
- [ ] **Choice pacing** — pause only at every 5th depth (mini-boss/boss floors);
      auto-continue between; flee button works between fights only (D33)
- [ ] **Smart protected auto-equip** (D33) — never displaces set/unique/manual
      picks without a swap prompt on the extract summary; toggleable
- [ ] **Depth map** — boss every 10th + mini-boss every 5th, endless; extend
      roster past depth 29 (currently boss-free!); theme scaffolding to ~60;
      pack composition per kind (roster.md)
- [ ] **Boss rooms** (D31) — door transition, name banner, signature
      wind-up telegraphs; rotation-capable/manual-advantage tuning
- [ ] **Death recap card** + elite/boss passive badges at spawn (D34-D35)
- [ ] **Scaling curve rework** — mild compounding past ~30 so walls exist
- [ ] **Balance sandbox tool** (TUNING sliders + live sim readout) — then the
      **balance pass**: boss HP (270 @ d5 is 10× too spiky), normals not
      one-shot, checkpoint-start reward pacing
- [ ] Monster editor tool (optional, data rows are workable by hand)

- [ ] **Event floors** (D42) — shrine/altar/cache/lore at ~1-in-8; seeded;
      auto-resolve rules for rotation/offline
- [ ] **Loot as light** (D41) — rarity-glow orbs + fly-to-bag collection
- [ ] **Support monsters + theme affinities** (D38/D40) — kill-order packs,
      ±25% status potency per theme

## 🟢 Phase 3 — Classes & onboarding (D12-D13)

- [ ] **Archer base kit** (needs attack speed) — fast attacks, crit/mark flavor
- [ ] **Apprentice base kit** (needs statuses) — slow heavy hits, stun/DoT
- [ ] Complete **Squire kit** to 5 abilities per the unlock schedule
      (`hero-progression.md` table)
- [ ] **Player passive slots** — wire class passive pools into `deriveStats()`
      (pools exist in `passives.ts`, never applied)
- [ ] **Class select screen** + hero-creation moment (all 3 bases, D13)
- [ ] **Guided first run** — authored gentle seed d1-5, 2-3 inline prompts,
      skippable after prompt 1 (D35), first-extract celebration
- [ ] **Grim-glow sprite regeneration** (D29) — hero/goblin/rat are
      style-obsolete; regenerate + class sprites (squire/archer/apprentice)
      + monster pass per ART_BIBLE recipe & asset-manifest phases

## 🔵 Phase 4 — Economy & automation (D15-D18)

- [ ] **Consumables** — Healing Draught, Revive Scroll, Loot Charm, Whetstone;
      2 loadout slots; pre-run buy screen
- [ ] **Automation tiers 1-3** — Auto-Continue (to depth X), Rotation
      Conditionals (rules like "Guard when HP<50%", D33/core-run ladder),
      Auto-Extract (depth/HP threshold); gold-priced, milestone-gated
- [ ] **Gear level requirements** (D15) + migration backfill for saved items
- [ ] **Salvage + Forge crafting** (D44) — selling→salvage, essences (5
      counters), reroll/upgrade costs gold+essences
- [ ] **Loot filter** (D47, free QoL with salvage) + **unique pity
      fragments** (D46, 1/boss kill → craft chosen theme unique)
- [ ] **Codex v1** (D45) — bestiary/collection/deeds counters + Trophy
      Hall UI; deed rewards wire to flair/cosmetics
- [ ] **Character sheet + compare arrows + wall forecast** (D49)
- [ ] **Torchrest hub v1** (D43) — street screen: Lift/Market/Forge/Warehouse
      as tap-through buildings; sinks visualized as upgrades
- [ ] **Stash pages** purchasable; overflow notifies, never silently deletes
- [ ] Number formatting (1.2K/3.4M) as gold grows

## 🟣 Phase 5 — Chains & mastery (D7-D11)

- [ ] Promotion gates (~L25/L45, cap ~70; must promote to keep leveling)
- [ ] **Temple trials** (D36) — quest tasks + retryable trial boss per gate
      (+ harder capstone trial); Temple + Quarters buildings in Torchrest
- [ ] Stage-2 kits: Warrior / Ranger / Mage
- [ ] Stage-3 kits: Knight / Sniper / Archmage (names TBD)
- [ ] **Mastery completion** — account-wide +2-3% bonus, saved playable class,
      inherited-ability slot, title/flair/skin
- [ ] Class switching UI (saved masteries + in-progress climb)

## ⚫ Phase 6 — Offline expeditions (D19)

- [ ] **Headless server run-simulator** (same shared engine, seeded)
- [ ] Expedition policy UI (start checkpoint + extract-at + consumables)
- [ ] Welcome-back report (loot, gold, deaths — replaces idle-gold banner)
- [ ] Automation tiers 4-5 (expeditions + capacity)

## 🟤 Phase 7 — Daily Delve (D22)

- [ ] One-attempt-per-day enforcement (consumed at RUN START, atomic)
- [ ] Shared daily seed drives the actual fight (seeded combat from Phase 1);
      always depth-1 start; tie-breaks + cosmetic podium rewards
      (delve-generation.md rules)
- [ ] Server verification by replay (anti-cheat completes here; daily runs first)
- [ ] Daily panel/leaderboard surfaces (board code exists, parked)

## ⚪ Phase 8 — Frontier, seasons, Reddit-native (D20-D21)

- [ ] **Live post preview** (D48) — Terror HP + top delver rendered in-feed
- [ ] **Ledger comment shares** (D48) — death/mastery/unique one-tap posts
- [ ] **Frontier boss ladder** on the existing aggregate pipeline
      (depths → damage, boss HP scaled to active delvers)
- [ ] Boss-felled celebration posts + sub-wide buff windows
- [ ] Daily frontier report (scheduler exists, parked) + post calendar
- [ ] **Mod opt-outs** (D35) — Devvit settings: toggle reports/event posts,
      frequency cap
- [ ] Seasons: 4-week reset, cosmetic stamps, seasonal modifier, contributor
      reward tiers (frontier.md table)
- [ ] Sub-vs-sub ladder — LAST (blocked on cross-install plumbing)
- [ ] Monetization (strict cosmetics/status only, D2) — Torchrest decorations
      + community supply drop (D43); after core is fun

---

## 📦 Post-launch backlog (RELEASE_PLAN owns the order)

Hidden chains — relic/deed/community unlocks (D37) · branch nodes per chain
(seasonal cadence) · new depth themes past 60 · ambient audio loops · boss
death animations · seasonal ladder brackets if mastery power skews dailies

---

## 🎨 Art & juice — sprinkle, don't batch

> Do a visual pass when a system is proven fun. If you'll stare at it all
> week, give it a sprite; if it might get redesigned, a rectangle is fine.

All art follows `game_design/art/ART_BIBLE.md` (grim-glow, D29) and the
phased inventory in `art/asset-manifest.md`. Highlights:

| System | When |
|--------|------|
| Status/passive-badge icons (~27) | Phase 1-2 — the framework HUD needs them |
| Monster sprites + theme backdrops + boss rooms + loot orbs + event props | with Phase 2 depth-map/world work |
| Grim-glow regen of hero/goblin/rat + class sprites + option-1 ability icons | with Phase 3 class select |
| Gear paper-doll layers (weapons first) + Torchrest street + codex UI | with Phase 4 economy/hub |
| Stage-2/3 hero sprites, set/unique bespokes, temple | with Phase 5 chains |
| SFX pack (audio.md) | Phase 3 — first juice pass |
| Feed preview render + ledger share cards + frontier Terror art | Phase 7-8 |
| Combat juice (crit shake, death fade, boss entrance) | one tween at a time, whenever in LaneScene |
