---
tags: [art, todo, living]
status: living
---

# Style TODO — making Delve LOOK like a cohesive game

Tracks the visual-cohesion / "juice" workstream on top of the raw asset
inventory. Subordinate to [[ART_BIBLE]] (grim-glow canon, D29) and
[[asset-manifest]] (the counted inventory); slots under `TODO.md` → "Art &
juice" + Phase 2 world work. **Follow the bible; regenerate off-style assets
rather than bending the bible.**

Legend: ✅ done · 🚧 in progress · ⬜ todo · 🕓 deferred (explicitly later)

## 1. Grounding — sprites stand ON the floor (bug pass 2026-07-23)
- [x] ✅ Per-actor **contact shadow** planted at feet (doesn't bob) — `MonsterActor.shadow`
- [x] ✅ **Defined ground shelf** in `drawBackground` (lit near-lip + floor recedes to shadow)
- [x] ✅ **HP bars / name / badges** anchor to sprite's real top (`topY`, boss-scale aware) + bars draw above sprites
- [x] ✅ **HERO_SPEC was stale** (originY 0.875/nativeH 103 → real 0.75/90 from bbox) — the hero's float
- [ ] ⬜ Verify on device after redeploy (the "still floating" screenshot was the OLD pre-fix build)
- Note: floor now = the painted backdrop's own foreground floor (§2), so sprites stand on real ground

## 2. Backdrop + ground tile per theme  🚧 CURRENT
Goal: sprites + decor + floor + wall read as ONE place, not sprites on a
gradient. Layered approach (ART_BIBLE §7): code sky gradient (have) → generated
**ground tile** (tiling floor at GROUND_Y) → generated **wall/midground** band →
decor (have). Boss-lair = same, doused (have).

✅ **ALL 6 DONE 2026-07-24** — one painted backdrop each (floor-inclusive),
`public/backdrops/<theme>.png`, wired in `drawBackground` (scale 2× → floor on
GROUND_Y, verified `floorAtGroundY:true`). Fallback gradient kept for safety.

| Theme | Backdrop (floor-inclusive) | Status |
|-------|----------------------------|--------|
| Goblin Camp | ✅ cave + campfire | done |
| Crypt | ✅ moonlit stone chamber | done |
| Warrens | ✅ tunnel + green glow | done |
| Deep | ✅ teal-crystal cavern | done |
| Volcanic | ✅ lava-river cavern | done |
| Abyss | ✅ void-rift chamber | done |

Follow-ups: backdrops carry faint PixelLab watermarks in bottom corners (dark/
faint — crop later if visible on device). Decor props are now auto-dropped when
a backdrop exists (backdrop is richer); re-add curated foreground props later.

**Approach found 2026-07-24 (much simpler than a tileset):** `create_map_object`
at the lane aspect (400×320 → scale 2× → fills 800×640) paints a FULL side-view
dungeon scene — cave walls + glowing opening + **floor in the foreground**. The
backdrop INCLUDES the ground, so "ground tied to backdrop" is automatic: place
the image at (0,0) origin (0,0) scale 2, its floor lands exactly on GROUND_Y=640,
fighters stand on it. One image per theme (6 total), boss-lair = same image +
code darken/vignette. Sidescroller-tileset (16px Wang tiles) was the WRONG tool —
too small/fiddly for a flat lane. Decor props stay as foreground.

## 3. UI restyle — HUD matches grim-glow  ⬜
- [ ] ⬜ Top bar (depth / bars / boss name) → grim-glow frame (`create_ui_asset`)
- [ ] ⬜ Bottom section (skills / gear / bag / money) → themed panel frame
- [x] ✅ Choice row already restyled → diegetic lane doors (2026-07-23)
- [ ] ⬜ Extend `ui-sheet.png` + `ui-map.json` roles per ART_BIBLE §8

## 4. Choice doors → PHYSICAL doors  🕓 later (user: "later thing, not now")
- [ ] 🕓 Doors OPEN (frame anim) and the hero RUNS INTO them on descend/extract
- [ ] 🕓 Tie into the existing `bossDoorTransition()` run-through

## 5. Monsters must be CHARACTERS, not objects  🕓 later — IMPORTANT
The 24 monsters + hero-theme sprites were made via `create_map_object` (static,
auto-delete after 8h, **no animation support**). For the D26 animation matrix
(idle/attack per monster) they must be PixelLab **characters** (`create_character`
→ persistent IDs, animatable). Plan: regenerate as characters, OR use v3
`reference_image_base64` to rotate/convert the existing sprites into characters
(preserves silhouette). Record IDs in [[asset-manifest]] ledger. Blocks the
Phase 2/3 animation pass. The current static-sprite lane is the v1 stand-in.

## 6. Later juice (deferred)
- [ ] 🕓 Loot orbs as sprites (currently procedural circles in `lootOrb()` — fine for now)
- [ ] 🕓 Event props (shrine / altar / cache / lore NPC, D42)
- [ ] 🕓 Base-camp / Torchrest backdrop (D43)
- [ ] 🕓 Frame animations for all monsters (needs §5 characters first)

## Related
- [[ART_BIBLE]] · [[asset-manifest]] · [[delve-art-icons]] (session memory)
