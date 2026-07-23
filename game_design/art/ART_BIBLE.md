---
tags: [art, bible]
status: living
---

# Art Bible — how Delve looks, and how it STAYS looking that way

Canon for every visual asset (D26 in [[DECISIONS]]). Generated art must
follow this doc; if an asset doesn't match, regenerate it — never bend the
bible to fit a generation. Inventory + build phases live in
[[asset-manifest]].

## 1. The canonical style recipe (PixelLab) — GRIM-GLOW (D29)

> Supersedes the v0 "cute storybook" recipe. The three existing sprites
> (hero/goblin/rat) are style-obsolete and get regenerated in the first
> art phase.

Use **verbatim** in every character/object description:

> **"dark fantasy pixel art, moody desaturated colors with luminous glowing
> accents, rim lighting, subtle dark outline, gritty heroic dungeon
> atmosphere"**

Two hard guardrails on top of the recipe:

- **Readability floor** — moody, never murky. This plays on phones in bright
  rooms: silhouettes must stay high-contrast against the backdrop, value
  floor sits ABOVE true Diablo-dark, every character carries a rim light.
  If you squint at 50% zoom and can't instantly tell hero from background,
  regenerate brighter
- **Thin dark outline stays** — not the old bold cartoon outline, but never
  outline-free. The outline is the #1 consistency anchor across AI
  generations; grim-glow without it drifts style within a dozen assets

Fixed generation parameters:

| Param | Value | Notes |
|-------|-------|-------|
| view | `side` | lane game; heroes face EAST, monsters face WEST (no runtime flipping) |
| shading | `detailed` | grim-glow needs the extra value range (enum: flat/basic/medium/detailed) |
| outline | `single color black outline` | rendered thin at 64-96px scale |
| detail | `medium detail` | |
| character size | `96` (integer!) | PixelLab upscales → 136×136 PNG output (D29: 64-96px band) |
| props/icons size | 32 (loot/tiles) · 24 (icons) | integers only |

Known API gotchas (from production use): ~4 create calls then a 429 — space
them out; generations fail under "heavy load" — retry; `size` must be a
square integer, never `{width,height}`.

**The glow rule** — light IS the reward language: loot drops, ability
casts, extraction lift, checkpoint doors, and legendary gear all EMIT
light; the environment absorbs it. The deeper the theme, the darker the
base values and the harder the glow pops (§3). Never spend glow on
non-reward elements.

## 2. Consistency mechanisms (the answer to "how does art stay the same")

1. **Recipe verbatim** — the quoted string above goes in every prompt,
   plus the fixed params. Style drift starts the day someone freestyles
2. **Character ID reuse** — PixelLab stores characters; ALWAYS animate/extend
   an existing character via its ID rather than regenerating the base.
   Known IDs: hero `1a5b8f3b…`, goblin `b15d4ed6…`, rat `5aeeebaf…` — extend
   this table in [[asset-manifest]] with every accepted asset
3. **Reference anchoring** — when generating a themed variant (e.g. Skeleton
   Captain from Skeleton), name the parent asset in the prompt and keep all
   fixed params identical
4. **Acceptance checklist** (run before an asset enters the atlas):
   - [ ] outline: thin dark, unbroken silhouette
   - [ ] palette: desaturated base + theme glow accent (§3); no cute/bright drift
   - [ ] rim light present; silhouette passes the squint test vs its theme backdrop
   - [ ] reads at display size (monsters ~124-150px on an ~800px canvas)
   - [ ] feet baseline within 4px of canvas-standard footline
   - [ ] no anti-aliasing halos (check against dark bg)
5. **Origin discipline** — decode each PNG's opaque bbox (zlib script,
   `scratchpad/bbox.mjs` pattern) → origin = (horizontal center, feet).
   Recorded per-asset in the manifest; LaneScene CharSpecs read from there
6. **This doc is upstream of prompts** — new asset categories get a §
   here BEFORE the first generation

## 3. Palette — the darkening descent (D29)

Base values DARKEN with depth; each theme owns one luminous GLOW accent.
Surface themes are dim-but-warm; the Abyss is near-black with the hardest
glow contrast. Depth becomes visible progress; loot shines brighter the
deeper you are.

| Theme (depths) | Base value | Glow accent | Mood |
|----------------|-----------|-------------|------|
| Base camp (Torchrest) | warmest, lightest | lantern amber | weary safety, the last warm light |
| Goblin Camp 1-10 | dim earth tones | campfire orange | cave-mouth twilight, crude torches |
| Crypt 11-20 | cold grey-violet | pale ghost-blue | dust, moonlight through cracks |
| Warrens 21-30 | dark mud browns | sickly yellow-green | cramped, wet, chittering |
| Deep 31-40 | near-dark blue-black | fungal teal | vast silence, bioluminescence |
| Volcanic 41-50 | ash black + deep reds | ember orange | heat shimmer, falling ash |
| Abyss 51-60 | blackest | void purple + white sparks | wrong, beautiful, humming |

Monster rarity tints stay as built: elite = blue `0x4aa3ff`, boss = gold
`0xffb020`. Loot text colors as built (rarity ramp, set green `#2ecf7f`,
unique orange `#ff8a3d`).

## 4. Paper-doll spec (worn gear — full family visibility, D26)

Prior decisions upheld: gear renders WORN on the hero; items store NO art —
sprite resolved at render: `uniqueOverride ?? setOverride ??
family.tiers[tierIndex]`; all layers in ONE packed gear atlas.

- **Layer draw order** (back→front): body(base hero) → legs → feet → belt →
  armor(body slot) → helm → off-hand → weapon. Rings/amulet don't render
  (jewelry is stat candy; a glint VFX on legendary+ instead)
- **Family × tier matrix**: every base family ([[gear-catalog]], 33 bases)
  gets **3 visual tiers** — Crude (common/uncommon), Fine (rare/epic),
  Mythic (legendary). Rarity TINT differentiates within a tier
- **Set/unique overrides**: bespoke single sprites (no tiers) — the chase
  items look one-of-a-kind by design
- **Canvas**: each layer drawn on the hero's 136×136 canvas, pre-aligned to
  the base pose — a layer is a transparent overlay, not a cropped item

## 5. Animation matrix (D26 — "everything animated, base set by type")

| Entity type | Base animation set | Frames (v1 target) |
|-------------|-------------------|--------------------|
| Hero (9 chain stages) | idle · attack · run | 4 · 4 · 4 |
| Melee monster (grunt/brute/swarm) | idle · attack | 4 · 4 |
| Caster monster | idle · cast | 4 · 4 |
| Boss | idle · attack/cast · signature pose | 4 · 4 · 1 |
| Deaths (all) | tween (fade+fall) in v1 — frame anims later | — |

Generate via `animate_character` on the stored character ID (templates like
`fight-stance-idle-8-frames` exist; downsample to 4 frames if needed).

**Paper-doll × animation — the attachment-anchor rule.** Gear layers are
STATIC images; they are not re-generated per animation frame. Each hero
animation carries a per-frame **anchor table** (hand, head, chest, hip,
feet offsets in px). At runtime each layer is pinned to its anchor per
frame — the sword swings because the hand anchor moves, not because the
sword has frames. Anchor tables are authored once per hero stage animation
(9 stages × 3 anims) and live in the manifest. This is the single most
important pipeline rule: without it, full-family paper-doll × animation
explodes into thousands of generations.

## 6. VFX vocabulary (statuses + abilities — tween/flash primitives)

Every status in [[status-effects]] gets ONE visual identity, built from
cheap primitives (tint, flash, shake, particle-lite via tweened sprites):

| Status | Visual |
|--------|--------|
| Stun | yellow stars orbit head, sprite desaturates |
| Poison | green tint pulse + rising bubbles |
| Burn | orange tint flicker + ember flecks |
| Bleed | brief red flash on tick |
| Slow | blue-grey tint, bob tween slows |
| Weaken / Armor Break | purple / rust crack icon flash on apply |
| Mark | floating reticle above target |
| Curse | violet wisp loop |
| Fortify / Shield | blue edge glow / grey HP-bar overlay segment |
| Rage / Haste | red pulse + scale 1.05 / white speed ticks |
| Regen | soft green sparkle per tick |
| Undying | gold outline shimmer |

Ability families: physical hits = lunge+impact flash (exists) · big hits =
+screen shake 120ms · casts = hero flash in ability color + projectile
tween · buffs = rising ring. Crit = existing yellow float + 80ms shake.

## 7. Backgrounds & environment

Per theme: 1 static painted-pixel backdrop (800×640 lane area) with 2-3
loose decor sprites scattered for variety, lit per §3 (dark base, glow
accent sources IN the backdrop: torches, fungus, embers). No parallax v1
(webview perf). Depth transition = crossfade + darkening of base values.
Base camp (Torchrest) gets its own warm backdrop — returning from a run
should FEEL like surfacing into light.

**Boss rooms (D31)**: each theme gets a boss-room backdrop variant (same
scene, torches doused, glow accent intensified, floor vignette) + a door/
gate sprite for the transition. Entering = crossfade + name banner.

## 8. UI skin

Extend the existing `ui-sheet.png` atlas + `ui-map.json` role mapping. New
roles needed (checkpoint picker, loadout grid, crafting, expedition panel)
follow the same 9-slice/frame conventions already in the sheet. Icons
(D27): 24px, same recipe, flat single-subject on transparent bg —
generated in themed batches so each batch shares palette weight.

## 9. Do / Don't

- ✅ regenerate until it matches; generations are cheap (2,000/cycle)
- ✅ one new asset category = one new § here first
- ❌ never mix a non-recipe asset "temporarily" — placeholders are colored
  rectangles, not off-style art (rectangles are honest; wrong style is debt)
- ❌ never hand-edit pixels to fix style (edits don't reproduce; fix the
  prompt)

## Related

- [[asset-manifest]] — every asset, counted & phased · [[audio]]
- [[gear-catalog]] — the families §4 renders · [[roster]] — the cast
- [[DECISIONS]] D26-D28
