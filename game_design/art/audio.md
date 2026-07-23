---
tags: [art, audio]
status: planned
---

# Audio — light SFX pack (D28)

v1 scope: ~18 one-shot SFX, no music. Sourced from free packs (kenney.nl
"RPG Audio"/"Interface Sounds", freesound CC0) — pixel-game SFX don't need
custom generation. Mute toggle in the menu panel, preference persisted
locally. Revisit ambient loops per theme post-launch (explicitly deferred).

## Event → SFX map

| Event | Sound feel | Notes |
|-------|-----------|-------|
| Hero hit lands | soft thump | pitch-vary ±10% to avoid fatigue |
| Crit | sharper crack + shimmer | pairs with screen shake |
| Monster hit lands | duller thud | distinct from hero's |
| Dodge / Block | whiff / clink | |
| Ability cast | class-flavored whoosh (3 variants) | physical/ranged/arcane |
| Status applied | tick per family (DoT fizz, stun ding, buff chime) | 3 sounds cover 15 statuses |
| Kill | small pop + coin tinkle | |
| Loot drop | chest thunk; rarity riser for epic+; fanfare for set/unique | 3 sounds |
| Level up | bright fanfare | |
| Checkpoint choice appears | low drum | the tension beat |
| Extract success | warm resolve chord | THE payoff sound — pick carefully |
| Death | descending sting | short, not punishing |
| Boss spawn | horn + rumble | |
| Mastery / promotion | big fanfare | reuse for celebrations |
| UI tap / equip | click / cloth rustle | |

## Constraints

- Total audio budget ≤ ~300KB (webview memory + Devvit bundle limits) —
  short mono OGGs
- Autoplay: mobile webviews require a user gesture before audio — init on
  first tap (the class-select or first Continue tap)
- Volume ducking not needed v1 (no music layer)

## Related

- [[ART_BIBLE]] · [[asset-manifest]] · [[DECISIONS]] D28
