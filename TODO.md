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
- [x] Fresh-hero HP fix (Squire baseMaxHp 40) — was the "HP 15" bug; verify once in playtest

---

## 🔴 Phase 0 — Foundation fixes (audit findings; small, do first)

Correctness/exploit issues that corrupt balance data and player trust while
they live. All are contained changes.

- [ ] **Deterministic reward math** — `runReward()` + `idleGoldPerSecond()`
      currently live-roll elite chance (random payouts; idle rate can silently 4×).
      Switch to expected-value (or seeded) monster rewards in `waves.ts`
- [ ] **Depth plausibility clamp + rate limit** on `/api/run/result` — depth
      is client-trusted up to 100,000 and the daily leaderboard already records
      it. Clamp vs hero level/gear + min-run-duration sanity check
- [ ] **Save schema versioning** — add `v` field to StoredHero + explicit
      migration table; retire key-sniffing before hero state grows (masteries,
      checkpoints, automation are coming)
- [ ] **Extract retry** — failed `/api/run/result` currently vanishes the run
      on reload (silent local-only fallback). Queue + retry, tell the player
- [ ] **Redis lost-update guard** — get→mutate→set races between equip/sell/run
      endpoints; add optimistic version check on save
- [ ] **Dead code sweep** — delete/quarantine map-era code: `delvegen.ts`,
      `noise.ts`, `DelveMap`/`Terrain` types, legacy `/api/init|state|score`
      routes, hidden HTML HUD (`ui/hud.ts` render path)
- [ ] **Docs hygiene** — mark `GAME_BLUEPRINT.md` superseded (points to
      `game_design/`); it describes the old Faction War concept
- [ ] **Test harness** — tsx-run test file over shared math (`deriveStats`,
      `rollGear`/`sanitizeGearItem`, `runReward`, `frontier` with fake Redis).
      The shared layer was built for this; balance work needs the safety net

## 🟠 Phase 1 — Combat framework v2 (D14, D30-D32) — unblocks nearly everything

- [ ] **Per-entity attack timers on a 100ms clock** — kill the global 2s
      exchange tick; interval is a class/template stat; `attackSpeedPct` live;
      damage variance → ±5% (D35)
- [ ] **Rotation system** (D30) — slot 1 = basic attack (no mana); slots 2-5
      fire by player-ordered priority (skip-if-unaffordable); manual taps
      interleave; rotation-order editor UI
- [ ] **Packs** (D32) — 1-3 enemies, front/back rows, ability targeting types
      (front/all/back/random), floor-budget reward split (FORMULAS)
- [ ] **Status-effect framework** — unified 16 statuses incl. generic StatMod
      ([[status-effects]]): stun/DoT/debuff/buff/shield/Shock; element tags
      (D38); 1s tick; HUD icons
- [ ] Replace hard-coded Fortify check in LaneScene with a status
- [ ] **Sim CLI v2** (TOOLING #2) — headless seeded runs of combat v2; the
      test harness and the future server sim both ride on it
- [ ] **Seeded combat end-to-end** — thread `Rng` through LaneScene (damage,
      drops, spawns). Prereq for Daily Delve, offline sim, server verification
- [ ] Cleanup while in there: `dispatchHook` mutate-and-return split; revive
      probe no longer re-fires unrelated `onTakeDamage` handlers
- [ ] Flip cheap staged stats live once statuses exist (poison, cleave-as-
      adjacent-hit, burn/bleed/slow appliers)

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
