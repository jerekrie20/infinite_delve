---
tags: [art, manifest]
status: living
---

# Asset Manifest — every asset, counted, phased, tracked

The complete inventory implied by the catalogs. Update the Status column as
assets are accepted (per the [[ART_BIBLE]] checklist); record PixelLab
character IDs here so animations extend the same character. Phases reference
`TODO.md` build phases.

**Totals: ~240 sprites/layers + ~91 icons + 13 backdrops + ~18 SFX.**
At 2,000 generations/cycle this is comfortable — the constraint is
acceptance/wiring time, not generation budget.

> ⚠️ **D29 style change**: the three existing sprites (hero/goblin/rat) are
> cute-storybook and now style-obsolete — regenerate in grim-glow during
> the first art phase. Their character IDs may still seed silhouettes, but
> acceptance runs against the NEW recipe.

## 1. Heroes — 9 chain stages ([[class-kits]])

Per stage: base sprite + idle(4f) + attack(4f) + run(4f) + **anchor tables**
(hand/head/chest/hip/feet per frame — required for paper-doll, see
[[ART_BIBLE]] §5).

| Stage                      | Base                              | Anims | Anchors | Phase                       |
| -------------------------- | --------------------------------- | ----- | ------- | --------------------------- |
| Squire                     | ✅ `spr_hero.png` (ID `1a5b8f3b…`) | ⬜     | ⬜       | 3                           |
| Archer · Apprentice        | ⬜ ⬜                               | ⬜     | ⬜       | 3 (class select needs them) |
| Warrior · Ranger · Mage    | ⬜ ×3                              | ⬜     | ⬜       | 5 (promotions)              |
| Knight · Sniper · Archmage | ⬜ ×3                              | ⬜     | ⬜       | 5 (masteries)               |

## 2. Monsters — 18 templates + 6 bosses ([[roster]])

Per template: base + idle(4f) + attack-or-cast(4f). Bosses add signature
pose. Recolor-from-parent is acceptable within a theme (Scout→Brute);
bosses always bespoke (they're checkpoint moments — sprite priority #1).

| Theme | Templates | Boss | Phase |
|-------|-----------|------|-------|
| Goblin Camp | Scout ✅(`b15d4ed6…` as goblin) · Brute ⬜ · Shaman ⬜ | Chieftain ⬜ | 2 |
| Crypt | Skeleton ⬜ · Captain ⬜ · Ghoul ⬜ | Necromancer ⬜ | 2 |
| Warrens | Giant Rat ✅(`5aeeebaf…`) · Plague Rat ⬜ · Tunnel Horror ⬜ | Broodmother ⬜ | 2 |
| Deep | Wraith ⬜ · Deep Stalker ⬜ · Gloom Caller ⬜ | The Hollow King ⬜ | 2-4 |
| Volcanic | Magma Imp ⬜ · Cinder Brute ⬜ · Flame Adept ⬜ | Pyre Tyrant ⬜ | 4-5 |
| Abyss | Void Spawn ⬜ · Abyss Knight ⬜ · Null Witch ⬜ | Herald of the Abyss ⬜ | 5 |

## 3. Gear layers — paper-doll ([[gear-catalog]] × [[ART_BIBLE]] §4)

Renderable families (rings/amulets don't render): 6 weapons + 3 off-hands +
3 body + 3 head + 3 legs + 3 feet + 3 belt = **27 families × 3 visual tiers
(Crude/Fine/Mythic) = 81 layers**, one packed gear atlas.

| Group | Layers | Phase |
|-------|--------|-------|
| Weapons (sword/axe/dagger/greatsword/bow/staff ×3) | 18 | 4 (first — biggest fantasy payoff) |
| Off-hands (shield/quiver/orb ×3) | 9 | 4 |
| Body + Head (plate/leather/robe, helm/hood/circlet ×3) | 18 | 4-5 |
| Legs + Feet + Belt (×3 each ×3 tiers) | 27 | 5 |
| Legendary glint VFX (jewelry stand-in) | 1 effect | 4 |

**Bespoke overrides**: set pieces on renderable slots = **18** · uniques on
renderable slots = **9** (Aegis Heart, Tunnel Rat's Charm, Null Sigil are
jewelry — glint only). Phase 5.

## 4. Icons — 79 total, phased (D27)

24px, shared recipe, themed batches.

| Batch | Count | Phase |
|-------|-------|-------|
| Statuses ([[status-effects]]) | 15 | 1 (framework HUD needs them) |
| Elite/boss passive badges (D34: thorns, revive, execute…) | ~12 | 1-2 (spawn readability) |
| Consumables | 4 | 4 |
| Abilities — option-1 column | 15 | 3 |
| Abilities — options 2-4 | 45 | with their content (3-5) |

## 5. Backgrounds & environment ([[ART_BIBLE]] §7)

7 backdrops (base camp + 6 themes) + **6 boss-room variants + 1 boss door
sprite (D31)** + 2-3 decor sprites each (~14). Phase 2 for themes 1-3 +
base camp + their boss rooms; later themes with their content.

## 6. UI atlas additions

New `ui-map.json` roles: checkpoint picker frame + node states, loadout
grid + option cards, **rotation-order editor (drag list, D30)**, **death
recap card (D35)**, crafting panel, consumable slots, expedition policy
panel, mastery banner, frontier boss HP frame. ~12-14 roles, extend
`ui-sheet.png`. Phases 2-8 as each screen ships (see UI flows in
[[RELEASE_PLAN]] milestones).

## 7. SFX — light pack (D28, [[audio]])

~18 one-shots, sourced not generated. List + mapping in [[audio]]. Phase 3.

## 7b. New systems (final-pass additions, D41-D44)

- **Loot orbs**: 5 rarity glows + set-green + unique-orange variants (7
  small sprites + fly-arc tween) — Phase 2 with loot presentation
- **Event props (D42)**: shrine, gamble altar, treasure cache/chest, lore
  NPC silhouettes (~5) — Phase 2-3
- **Torchrest hub (D43)**: street backdrop + 8 building faces (+ upgrade
  variants for Lift/Forge/Warehouse ≈ +6) + decoration cosmetics
  (ongoing mtx/reward art) — Phase 4-5
- **Temple/trial (D36)**: temple interior backdrop + trial door — Phase 5
- **Icons additions**: Shock status (16th), 5 essence tiers, relic +
  theme unique-fragments (~14) — with their systems
- **Codex UI (D45)**: bestiary/collection/deeds tabs, silhouette state per
  item sprite (auto-derived: darkened sprite), deed badge frames — Phase 4-5
- **Numbers-context UI (D49)**: character sheet panel, compare arrows,
  wall-forecast readout — Phase 2-3 roles
- **Feed layer (D48)**: live post-preview render (Terror + HP bar
  composition) + ledger-share card template — Phase 7-8

## 8. Reddit-facing art

Splash frontier scene (theme-accent variants) · boss-felled celebration
card template · season finale card · mastery announcement card. Phase 8.

## Character ID ledger (extend on every accepted asset)

| Asset | PixelLab ID | Origin (x,y 0..1) |
|-------|------------|-------------------|
| hero (squire) | `1a5b8f3b…` | 0.533, 0.875 |
| goblin | `b15d4ed6…` | 0.515, 0.882 |
| rat | `5aeeebaf…` | 0.522, 0.868 |

## Related

- [[ART_BIBLE]] — the rules · [[audio]] · [[roster]] · [[gear-catalog]] · [[class-kits]]
