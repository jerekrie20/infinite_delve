---
tags: [catalog, combat, builds]
status: planned
depends-on: [combat, loot-gear, classes]
---

# Build Theory — how the pieces stack into an identity

Answers "how are builds built" (user question, final pass). A build is the
INTERSECTION of seven layers, each already specced elsewhere — this doc is
the map of how they combine, and the named archetypes content should
support. Balance goal: at any wall depth, ≥2 archetypes per class clear it.

## The seven power layers

1. **Class + stage** — base stats, attack interval, mana model ([[class-kits]])
2. **Attack style** (slot 1) — your every-swing identity (D30)
3. **Rotation** (slots 2-5 + order) — which abilities, which priority, which
   targeting; the ACTIVE expression of the build
4. **Gear families** — primary stats + affix pools chase per slot
   ([[gear-catalog]]); 2H vs 1H+off-hand is a build fork
5. **Sets + uniques** — the build-defining spikes (Cindersworn turns a Mage
   into a burn engine)
6. **Passives + mastery bonuses + inherited ability** — the account layer
7. **Consumables + shrine boons** — per-run flex ([[gear-catalog]], D42)

**Stats × statuses is the glue**: `*Chance` stats (burn/bleed/slow/shock/
poison) convert raw stats into status pressure; status potency scales off
the applier's ATK; theme affinities (D38) make element choice a FARMING
decision, not just a damage one.

## Element tags (D38)

fire→**Burn** · ice→**Slow** · lightning→**Shock** · dark→**Curse** ·
nature→**Poison** · physical→**Bleed**/**Stun**. Abilities and applier
stats carry one tag; themes resist/amplify tags ±25% ⚙ ([[roster]]).

## Named archetypes (content must keep these viable)

| Class | Archetype | Core loop | Key pieces |
|-------|-----------|-----------|-----------|
| Squire | **Juggernaut** | out-sustain attrition | Slam · Shield Wall · plate/shield · lifesteal/hpRegen · Warden's Vigil |
| Squire | **Thornwall** | enemies kill themselves | Retribution · thorns/counter affixes · Girdle · taunt-Weaken |
| Squire | **Executioner** | burst finishers | Executioner's Chop · execute/armorPierce · axe+Bleed · Judgement |
| Archer | **Stormquiver** | attack-speed engine | Twin Shot · Haste effects · dagger+quiver AS stacking · Shock procs |
| Archer | **Hemorrhage** | bleed stacking | Serrated Arrow · bleedChance · Barbed Assault · crit gear |
| Archer | **Deadeye** | giant crits | Snipe · crit trio affixes · Mark uptime · Perfect Draw |
| Apprentice | **Pyre** | burn uptime | Fire Bolt · Ignite/Fireball · burnChance staff · Cindersworn |
| Apprentice | **Frostlock** | control/slow-tank | Frost Shard · Ice Nova stuns · Frost Armor · Slow uptime |
| Apprentice | **Voidcaller** | shield + curse attrition | Mana Shield · shieldLeech/startingShield · Curse of Decay · Voidbound |

(Names are canon per [[WORLD]] conventions; each archetype should have a
set or unique that loves it — check when authoring seasonal gear.)

## Synergy map (statuses that combo)

- **Shock → big hits**: Shock amplifies the next hit — set up with fast
  attacks, cash in with Meteor/Deadeye/Judgement
- **Mark + everything**: Mark is the universal damage amp — backbone of
  group/boss burst windows
- **Bleed × crit**: bleedChance triggers on crit — crit stats double-dip
- **Poison × attack speed**: stacks-per-second — the AS archetype's DoT
- **Curse vs sustain monsters**: the answer to undead lifesteal/revive packs
- **Slow/Stun × attrition**: fewer enemy swings = the tank's real EHP

## Anti-patterns (sandbox red flags)

- One archetype >25% faster than the next best at the same investment
- A status with no archetype that wants it, or an affix no archetype chases
- A build that ignores slots 3-5 entirely and wins (rotation must matter)

## Related

- [[class-kits]] · [[stats-catalog]] · [[status-effects]] · [[gear-catalog]]
- [[DECISIONS]] D30, D38 · [[FORMULAS]] — the curves under all of it
