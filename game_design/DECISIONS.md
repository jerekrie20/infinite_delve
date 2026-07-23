---
tags: [decisions]
status: living
---

# Design Decisions — the locked record

Decisions made in the 2026-07-21 full-planning session. Every mechanic doc
derives from this list. If a doc contradicts this file, THIS file wins until
the doc is fixed. Change a decision here first, then propagate.

## Identity

| # | Decision | Choice |
|---|----------|--------|
| D1 | Game identity | **Hybrid idle: automation is progression.** Early game is manual and tense; players unlock automation (auto-continue → auto-cast → offline runs) as they progress. The game slowly learns to play itself. |
| D2 | Monetization line | **Strict: cosmetics + status only.** Real money never buys gold, automation, stash, consumables, or power of any kind. Revenue = Reddit Developer Funds (daily engagers + installs) + cosmetics. |

## The run

| # | Decision | Choice |
|---|----------|--------|
| D3 | Choice pacing | **Checkpoint choices.** Combat auto-continues between decision floors; the Continue/Extract pause fires only at every 5th depth (mini-boss and boss floors). A small always-available Extract button remains as a flee valve. |
| D4 | Run start | **Player-picked checkpoints.** Felling the boss at depth 10/20/30… permanently unlocks starting the next run at that depth. At run start (or after death) the player picks any unlocked checkpoint. |
| D5 | Death stakes | **Whole run at risk, banked is safe.** Checkpoints do NOT auto-bank. Extract banks everything gained this run; dying loses everything unbanked since the starting checkpoint. Previously banked gear/gold/XP is never at risk. |
| D6 | World structure | **Endless.** Theme changes every 10 depths (authored to ~100, procedural variants beyond). Boss + checkpoint at every 10th depth, mini-boss at every 5th. Deep-push is the ladder. |

## Progression & prestige

| # | Decision | Choice |
|---|----------|--------|
| D7 | Prestige model | **Class mastery via evolution chains.** Mastery = completing a class's full evolution chain (e.g. Squire→Warrior→Knight capstone). Base classes can grow multiple branches over time. |
| D8 | Hero model | **One active hero; mastered classes saved.** After mastering a branch you either keep playing that final form or restart as a new class/branch. Every mastered final form stays playable forever (switch anytime). |
| D9 | Chain leveling | **One continuous climb with promotion gates.** One level bar per branch-run (cap ~70); at gate levels (~25, ~45) you must promote to keep leveling. Branch choice happens at promotion. |
| D10 | Mastery grants | All four: **account-wide stat bonus** (+2–3% per mastery, tune in sandbox) + **the saved playable class** + **cross-class ability inheritance** (one signature ability usable by other classes) + **cosmetic/status rewards** (title, flair, skin). |
| D11 | First-mastery pacing | **~3–4 weeks** for an engaged daily player (≈ one season = one chapter). Later chains go faster via bonuses + twinked gear + deep checkpoints. |
| D12 | Launch tree scope | **3 straight chains, no branching at v1.0** (9 kits total). Branch nodes are seasonal content. |
| D13 | Onboarding classes | **All 3 base classes at creation** (Squire / Archer / Apprentice), guided first run. |

## Combat & gear

| # | Decision | Choice |
|---|----------|--------|
| D14 | Combat framework | **Build it fully:** per-combatant attack speed (timers per side) + unified status-effect system (stun, DoT, buff, debuff, mark — durations, ticking). Unlocks distinct class kits, boss signature moves (D39 — cooldown-based, not phases), and the ~12 staged stats. |
| D15 | Gear gating | **Level requirements on gear** (req ≈ the level a player naturally has at the item's drop depth). Fresh classes climb into their inheritance piece by piece; no class locks at launch. |

## Economy

| # | Decision | Choice |
|---|----------|--------|
| D16 | Currency | **Single currency (gold)** with short-number formatting as values grow. No copper/silver/diamond ladder. |
| D17 | Gold sinks | **Automation upgrades** (the marquee sink) + **gear crafting/reroll** + **stash upgrades** + **run consumables**. |
| D18 | Automation acquisition | **Gold-purchased tiers**, gated by milestones (see [[core-run]] ladder). |
| D19 | Offline runs | **Player-set policy, real simulation.** Player configures start checkpoint + extract-at depth; server simulates real runs with real deaths while away. Greedy policy = real lost hauls. |

## Community & meta

| # | Decision | Choice |
|---|----------|--------|
| D20 | Frontier | **Shared boss ladder.** Every run converts to frontier damage (scaled by depth). Felling a frontier boss unlocks the next + a sub-wide buff + a celebration post. |
| D21 | Seasons (~4 weeks) | Frontier + seasonal boards reset; **hero/masteries/gear persist forever**. Seasonal cosmetic rewards. Each season carries a **global modifier** (rule twist). **Sub-vs-sub rivalry** ladder (needs Devvit cross-install plumbing — phased last). |
| D22 | Daily Delve | **Real hero, depth leaderboard.** One shared seed per day, one attempt, per-sub board. Requires seeded deterministic combat. |

## Content structure (added 2026-07-21, content-catalog session)

| # | Decision | Choice |
|---|----------|--------|
| D23 | Gear slot families | **Every slot is a family of ~3 bases with distinct affix pools** (hand1 = 1H weapons: sword/axe/dagger; body = plate/leather/robe; …). **Two-handed weapons exist** (bow/staff/greatsword): they occupy hand1+hand2 (2H blocks the off-hand slot) and get a larger stat budget (~1.6×). Full matrix in [[gear-catalog]]. |
| D24 | Ability option grid | **5 ability slots × 4 options per slot per chain** (20 abilities/chain, 60 at launch). Slot unlocks grant option 1; options 2/3/4 unlock at later chain milestones (stage-2 promo, stage-3 promo, capstone — per-slot table in [[class-kits]]). Loadout = pick 1 option per slot. |
| D25 | Monster roster horizon | **Authored to depth 60** (6 themes × ~3 templates + 1 boss each) in [[roster]]; procedural variants past the authored horizon. Mini-boss floors (every 5th) are guaranteed elevated elites, not authored bosses. |

## Art, audio & normative docs (added 2026-07-21, vault-completion session)

| # | Decision | Choice |
|---|----------|--------|
| D26 | Art pipeline | ⚠️ *Style portion superseded by D29.* Still standing: worn gear = paper-doll layers with **full family visibility** (every base family visually distinct × rarity tiers). **Everything animated**: base animation set per entity type (heroes idle/attack/run; melee monsters idle/attack; casters idle/cast; bosses add signature pose; deaths = tweens in v1). Spec: [[ART_BIBLE]]. |
| D27 | Icons | **Pixel icons in the shared style, phased**: statuses + consumables + option-1 abilities (~34) first, remaining ability options as their content ships. Gear needs no icons (worn sprites + colored name text — prior decision upheld). |
| D28 | Audio | **Light SFX pack v1**: ~15-20 one-shots from free packs + mute toggle, no music. Spec: [[audio]]. |
| — | Normative math | **[[FORMULAS]] is the source of truth for every number.** Mechanic docs may quote values for readability; on conflict FORMULAS wins. |
| — | Normative save shape | **[[DATA_SCHEMA]] is the source of truth for persisted state** (StoredHero v2, Redis keys, migration policy). |

## Final interview pass (added 2026-07-21, third session)

| # | Decision | Choice |
|---|----------|--------|
| D29 | Art style v2 (supersedes D26's style) | **Grim-glow dark fantasy**: desaturated dark environments lit by luminous accents (torchlight, magic, loot shine); rim-lit characters with a THIN dark outline (consistency anchor); 64-96px characters; palette **darkens with depth** + one glow accent per theme; hard **readability floor** (moody, never murky — mobile in daylight must read). Existing cute-storybook sprites get regenerated. WORLD tone aligns dark (lantern-lit grit). |
| D30 | Rotation combat + slot-1 basic attack | **Slot 1 IS the basic attack** (chosen option = your attack style: no mana, fires on the attack-speed timer). Slots 2-5 are mana abilities. Normal fights: abilities fire via a **player-ordered rotation** (priority list, skip-if-unaffordable); manual casts may always interleave. |
| D31 | Boss rooms | Bosses get a room transition + active-play layer. **Rotation-capable, manual-advantage**: automation can fight any boss (offline runs work everywhere); manual timing (casts vs signature wind-ups) is ~20-30% better ⚙. |
| D32 | Packs + floor budget | Floors spawn **1-3 enemies** in front/back rows (melee front, ranged/casters back; composition by monster kind; bosses solo or +1 add). Targeting via ability type (front / all / back-row / random), never tap-targeting. **One floor budget** per depth split across the pack (+~15% pack bonus ⚙) — economy/pacing unchanged. Per-entity attack timers on a 100ms clock. |
| D33 | Run rules | **Smart protected auto-equip** (never displaces set/unique/manual picks without a prompt; toggleable) · **flee between fights only** (never mid-fight) · **HP attrition + heal-on-kill kept** (runs end to attrition — that's the wall) · **casts queue to the attack beat** (deterministic; revisit post-playtest). |
| D34 | Progression rules | **No post-capstone XP** (mastered class progresses via gear/ladder/frontier — the nudge to the next chain) · **class switching free at base** · **consumables consumed at run end, used or not** (per-run provisions, no inventory) · **elite/boss passives shown as badges at spawn** (informed push-or-flee). |
| D35 | Polish & ops | **Death recap card** (killer + last exchanges + what was lost) · damage variance **±5%** (was ±10%) · **full mod opt-outs** for auto-posts (Devvit settings) · tutorial **skippable after prompt 1**. |

## Systems round (added 2026-07-21, fourth session)

| # | Decision | Choice |
|---|----------|--------|
| D36 | Promotion temples | Gate levels (L25/L45) unlock the **Temple** in Torchrest: a short quest (theme-kill + extract tasks) then a retryable solo **trial boss** tuned to the gate. Pass = promote. Promotion is a story beat, not a level tick. |
| D37 | Hidden chains | All three unlock paths exist (post-launch content): **relic crafting** (fragment drops → craft the unlock), **secret deeds** (behavioral conditions, un-dataminable), **community unlocks** (frontier milestone opens a chain for the whole sub). |
| D38 | Elements | **Tags + affinities, no damage-type matrix.** Elements tag abilities/statuses (fire→Burn, ice→Slow, lightning→**Shock** (new), dark→Curse, nature→Poison, physical→Bleed). Monster themes carry light affinities: ±25% status potency ⚙ (e.g. Volcanic immune to Burn, vulnerable to ice). |
| D39 | Boss design | **NO boss phases** (HP-threshold triggers cut everywhere). Bosses use 1-2 **cooldown signature moves** (~every 10-15s ⚙): one-beat telegraphed wind-up → big effect. Counterplay = timing guard/stun into the wind-up. |
| D40 | Support monsters | New backline role: **support** (heals/buffs its pack on a cast timer, via existing handlers). Creates kill-order decisions; countered by `back`-targeting abilities. |
| D41 | Loot as light | Kills drop **glowing orbs** in rarity color (set-green/unique-orange burn brightest); auto-collect with a fly-to-bag arc + name toast; extract summary shows the pile. No pickup taps. |
| D42 | Event floors | ~1 in 8 non-boss floors ⚙ is an **event**: Shrine (run-long boon) · Gamble Altar (offer HP → chest) · Treasure Cache (choice of 2 items) · Lore Encounter (worldbuilding + tiny reward; occasionally seeds secret deeds). |
| D43 | Torchrest hub | The between-runs screen becomes **Torchrest**: Lift (delve/checkpoints), Forge (crafting), Market (consumables), Warehouse (stash), Temple (trials), Guildhall (frontier/daily), Trophy Hall (masteries/cosmetics), Quarters (class switch). Existing gold sinks VISUALIZED as building tiers. Cosmetic decoration = the D2-safe monetization surface. |
| D44 | Salvage crafting | **Selling → salvaging**: items break into gold + rarity-tiered **essences** (one material family, no marketplace). Crafting costs gold + essences; relic fragments (D37) are special-case materials. Junk drops now feed builds. |

## Research round (added 2026-07-21, fifth session — genre/market research pass)

| # | Decision | Choice |
|---|----------|--------|
| D45 | The Codex | Full completion log from launch: **bestiary** (kills per template) + **collection** (found/unfound per item, unfound as silhouettes — visible chases) + **deeds** (milestones/achievements → flair/cosmetic rewards; secret deeds D37 appear here once earned). Lives in the Trophy Hall; the sub gets a **Guild completion %**. Entries derive from the catalogs — near-zero content cost, Melvor-grade retention. |
| D46 | Unique pity | **Fragment pity via the Forge**: every boss kill drops 1 unique-fragment for its theme; ~35 fragments ⚙ craft a CHOSEN unique from that theme. Visible progress bar, no hidden counters; RNG drops still jackpot on top. Uses D44 fragment plumbing. |
| D47 | Loot filter | **Free QoL, ships with salvage (D44)**: Forge rules — "auto-salvage ≤ rarity X below depth Y", sets/uniques always exempt. Never gated behind automation purchases (filters are hygiene, not progression). |
| D48 | Feed layer | **Live custom post preview** (Terror HP + today's top delver render in-feed, pre-tap) + **one-tap ledger shares** (death recap / mastery / unique-found post a formatted foreman-voice comment — the "I tried" pattern). |
| D49 | Numbers context | Full **character sheet** (every derived stat + DPS estimate), **item compare arrows** on all tooltips, and a **wall forecast** ("projected wall: ~depth 34") — answers the genre's "numbers lose meaning" quit reason. |

## Lore round (added 2026-07-21, sixth session)

| # | Decision | Choice |
|---|----------|--------|
| D50 | Lore model | **Fragment-first with a hidden mystery spine.** The truth (authors-only, spoiler-walled in [[LORE]]): **"It digs back"** — the Delve is the works of something enormous digging upward; nightly reseed = It moved; Terrors = heralds; loot = payment/tailings; It is never named or confirmed. Player-facing lore ONLY as capped fragments (item flavor ≤20 words, encounters ≤60, bestiary ≤25) in three tiers (flavor/pattern/revelation). **Seasons connect** (standalone-playable ladders whose fragments assemble across S1→S3: "they were announcing"). Secret-deed hints hide inside encounters. LORE.md's truth section is canon; every fragment must obey it. |

## Engineering consequences (from the above)

- **Seeded deterministic combat becomes core infrastructure** — required by
  Daily Delve fairness (D22), offline run simulation (D19), and server-side
  run verification (anti-cheat). One engine, three payoffs. The shared combat
  math already accepts an `Rng`; the client must stop using bare `Math.random`.
- **Server-side run simulator** — D19 requires the full combat loop (hooks,
  statuses, abilities via policy) to run headless on the server. This is the
  same engine the balance sandbox and anti-cheat re-simulation need.
- **Per-side attack timers + status framework** (D14) must land before any
  second class ships.
- **Save schema versioning** — hero state grows (masteries, saved classes,
  automation, checkpoints, consumables); ad-hoc key-sniffing migration won't
  survive it. Add a `v` field before the next schema change.
- **Reward math must be deterministic** — `runReward`/idle currently re-roll
  elite chances with live RNG; must switch to expected-value or seeded rolls.

## Open questions (deliberately unresolved)

- Exact mastery bonus % (2–3 band) and gear level-req formula → balance sandbox.
- Branch count + themes per base class beyond launch (seasonal planning).
- Sub-vs-sub mechanics detail (blocked on Devvit cross-install capabilities).
- Whether daily-delve boards eventually need mastery brackets (watch data).

## Related

- [[Home]] · [[CORE_LOOP]] · [[mechanics-index]]
