---
tags: [schema, architecture]
status: living
---

# Data Schema — persisted state, source of truth

Normative for save shapes and Redis keys (see [[DECISIONS]]). Extends the
lean-key discipline already in `GearItem` (`r`/`s` short keys). The
StoredAccount below is the TARGET (v3) shape; today's `StoredHero` (v2)
migrates into it.

## Versioning & migration policy

- Every stored blob carries `v: number`. Reads run `migrate(vN → vN+1)`
  steps in order; writes always emit current v. Retire key-sniffing
  (`raw.r ?? raw.rarity`) as each shape gets an explicit step
- A migration is one pure function per version bump, unit-tested with a
  fixture of the old shape
- Unknown fields are preserved on read (forward compatibility for hotfixes)

### `hero:{userId}` version ledger

| v | Shape | Migration in |
|---|-------|--------------|
| 1 | implicit (no `v` field): original StoredHero; gear items may use old keys (`rarity`/`stats`/`critChance`); `bestDepth`/`lastSeenAt` may be missing | — (inferred on read) |
| 2 | **current**: StoredHero + `v: 2`; lean gear keys (`r`/`s`, `increasedCritPct`); `bestDepth`/`lastSeenAt` always present | `migrateV1toV2` (`src/server/core/heroSchema.ts`) — consolidates the old key-sniffing |
| 3 | TARGET: StoredAccount below (checkpoints, automation, masteries, classes…) | with the Phase 2+ features that need it |

## `hero:{userId}` — the account blob (TARGET, v3)

```ts
interface StoredAccount {          // ~replaces StoredHero
  v: 3;
  gold: number;
  lastSeenAt: number;              // epoch ms — idle/expedition accrual
  // Account-wide progression (D4, D8, D10, D18)
  checkpoints: number[];           // unlocked start depths [1, 11, 21…]
  automation: {
    tiers: number;                 // highest purchased tier 0-5
    autoContinueToDepth?: number;
    autoCastOn?: boolean;
    autoExtract?: { depth?: number; hpPct?: number };
  };
  masteries: string[];             // mastered chain-node ids ['knight',…]
  inherited?: string;              // the ONE slotted inherited abilityId
  cosmetics: string[];             // owned skin/title/flair/decoration ids (D43)
  essences: [number,number,number,number,number]; // per-rarity counters (D44)
  fragments?: Record<string, number>; // relic fragments for hidden chains (D37)
  trials?: Record<string, { quest: number[]; passed: boolean }>; // temple progress (D36)
  codex?: { kills: Record<string, number>; found: string[]; deeds: string[] }; // D45
  lootFilter?: { maxRarity: number; belowDepth: number };        // D47
  // Gear (shared; D15 level reqs live on items)
  stash: GearItem[];               // + stashPages: number
  stashPages: number;
  // Classes (D8: one active, mastered ones playable)
  activeClass: string;             // classId currently played
  classes: Record<string, StoredClass>;
  // Offline (D19)
  expedition?: {
    policy: { startDepth: number; extractAt: number; consumables: string[] };
    startedAt: number;             // sim window anchor
  };
}

interface StoredClass {
  level: number;
  xp: number;
  stage: number;                   // 0 base / 1 promoted / 2 final
  loadout: Record<number, string>; // slot(1-5) → chosen abilityId (D24)
  rotation: number[];              // slots 2-5 in priority order (D30); Phase 1 keeps this client-local (below)
  optionsUnlocked: string[];       // ability ids beyond defaults
  equipped: Partial<Record<GearSlot, GearItem>>; // per-class paper-doll
}
```

Notes: `GearItem` gains `req: number` (level requirement, stamped at roll) —
short key stays. Equipping moves items stash↔class; an item is never
equipped on two classes. Derived stats are NEVER stored (recomputed on
read, as today). Mana is never stored (resets between runs, as today).

**Size budget**: ≤ ~24KB per account blob (30-item stash + 4 classes ×
10 equipped ≈ 70 lean items ≈ 10-14KB + scalars). Stash pages raise this
~2KB/page — acceptable; revisit split-keys only if pages exceed ~5.

## Run-scoped (never persisted)

Depth, run haul, run gold, statuses, cooldowns, mana, monster state — all
client/sim-local. The server sees runs only via `run/result` (and produces
them itself for expeditions).

## Client-local (localStorage, not server state)

| Key | Content | Migrates to |
|-----|---------|-------------|
| `delve:pending-runs:v1` | failed run-result retry queue (Phase 0) | never — device-scoped by design |
| `delve:rotation:v1` | rotation priority order, slots 2-5 (D30) | `StoredClass.rotation` when the v3 StoredAccount migration lands (Phase 2+) |

## Meta keys (per-installation = per-subreddit; current pattern kept)

| Key | Type | Content | Expiry |
|-----|------|---------|--------|
| `hero:{userId}` | string(JSON) | StoredHero v2 (→ StoredAccount v3) | none |
| `daily:{dayKey}:board` | zset | member=username, score=depth | 7d |
| `daily:{dayKey}:attempt:{userId}` | string | run-start stamp (one-attempt rule, D22) | 2d |
| `frontier:{seasonId}` | hash | ladderIndex, bossHp, dmgToday, delverSet ref | season+7d |
| `frontier:{seasonId}:dmg:{dayKey}` | zset | per-player damage (soft-cap calc) | 7d |
| `season:current` | string | seasonId + modifier id + startedAt | none |
| `report:{dayKey}` | string(JSON) | frozen daily report snapshot | 30d |
| `rl:{bucket}:{userId}:{window}` | string(counter) | fixed-window rate-limit count | 2×window |
| `run:seen:{userId}:{runId}` | string(counter) | first-wins run-idempotency marker | 48h ⚙ |
| `run:done:{userId}:{runId}` | string(JSON) | completed run's `gained` summary (replayed to duplicates) | 48h ⚙ |

Devvit scopes Redis per installation — no sub token needed in keys
(current pattern, kept). Cross-sub (D21 rivalry) needs an external
aggregation path — deferred with that feature.

## Concurrency

Account writes use Redis WATCH/MULTI/EXEC compare-and-set on `hero:{userId}`
(Devvit's client supports it natively; chosen over a stored `_rev` counter,
which is not atomic without WATCH anyway — no schema field needed). On
conflict: re-read + replay the mutation (`updateHero` in
`src/server/core/heroStore.ts`). Retry budgets ordered
run-result > hero > equip > sell (audit fix); exhausted retries → 409.

## Related

- [[DECISIONS]] D4-D24 · `ARCHITECTURE.md` engine requirements ·
  `src/server/core/hero.ts` (migration site) · [[FORMULAS]]
